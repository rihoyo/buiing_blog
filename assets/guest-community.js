import { modifiedDate } from "./community-date.js";
import { renderMarkdown } from "./markdown.js";
import { mountCodeTools } from "./code-content.js";
import { guestErrorCode } from "./guest-errors.js";
import { escapeHTML as esc } from "./helpers.js";
const messages = {
  GUEST_JWT_REJECTED:
    "함수 인증 설정에서 요청을 거절했습니다. 운영자는 guest-interactions → Settings → Verify JWT with legacy secret을 OFF로 바꾸고 Save changes를 눌러 주세요.",
  GUEST_FUNCTION_MISSING:
    "등록 함수가 없습니다. 운영자는 이 Supabase 프로젝트에 guest-interactions라는 이름으로 함수를 배포해 주세요.",
  GUEST_DATABASE_SETUP_REQUIRED:
    "댓글 데이터베이스 연결이 완료되지 않았습니다. 운영자는 같은 Supabase 프로젝트에서 guest-community.sql 실행 결과를 확인해 주세요.",
  GUEST_SERVER_SETUP_REQUIRED:
    "등록 함수의 서버 환경 변수 설정이 누락되었습니다. 운영자는 Supabase 함수의 기본 환경 변수를 확인해 주세요.",
  GUEST_CONNECTION_FAILED:
    "등록 서버에 연결하지 못했습니다. 네트워크·브라우저 차단 설정과 함수 배포 상태를 확인해 주세요.",
  GUEST_FUNCTION_START_FAILED:
    "등록 함수를 시작하지 못했습니다. 운영자는 guest-interactions의 Logs에서 배포·실행 오류를 확인해 주세요.",
  GUEST_REQUEST_FAILED:
    "등록 요청을 처리하지 못했습니다. 운영자는 guest-interactions의 Logs에서 오류를 확인해 주세요.",
  ORIGIN_NOT_ALLOWED:
    "현재 사이트 주소에서는 등록이 허용되지 않습니다. 공식 블로그 주소에서 다시 시도해 주세요.",
  REQUEST_TOO_LARGE: "입력 내용이 너무 큽니다. 내용을 줄여 주세요.",
  GUEST_SETUP_REQUIRED:
    "댓글·방명록 연결이 필요합니다. 운영자 설치 안내의 guest-community.sql과 guest-interactions 함수를 확인해 주세요.",
  RATE_LIMIT:
    "요청이 너무 잦습니다. 잠시 후 다시 시도하세요. 새 글은 30초 간격으로 등록할 수 있습니다.",
  BLOCKED_WORD: "닉네임이나 내용에 허용되지 않는 문자가 포함되어 있습니다.",
  INVALID_PASSWORD: "비밀번호가 일치하지 않거나 이미 삭제된 글입니다.",
  INVALID_CONTENT: "닉네임·내용·비밀번호를 확인해 주세요.",
  INVALID_PARENT: "원본 댓글이 삭제되었거나 답글을 달 수 없습니다.",
  ACCOUNT_BANNED: "이 접속의 등록 권한이 제한되어 있습니다.",
  FORBIDDEN: "관리자 권한이 없습니다.",
  POST_PRIVATE: "비공개 글에는 비회원 댓글을 달 수 없습니다.",
  ENTRY_NOT_FOUND: "삭제되었거나 없는 댓글입니다.",
};
const stamp = (s) =>
  new Date(s).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  });
export async function mountGuestSection({
  node,
  client,
  scope,
  slug = null,
  thread = null,
  admin = false,
  authorize = async () => false,
}) {
  node.innerHTML = `<section class="guest-discussion"><h2>${scope === "guestbook" ? "방명록" : "댓글"}</h2><p class="editor-note">로그인 없이 닉네임과 수정·삭제용 비밀번호로 작성할 수 있습니다.</p><form class="guest-compose stack-form"><label>${scope === "guestbook" ? '방명록 내용 <span class="markdown-tip"><button type="button" aria-label="마크다운 도움말" aria-describedby="guest-markdown-help">?</button><span class="markdown-bubble" id="guest-markdown-help" role="tooltip"><strong>마크다운 쓰기</strong><br>**굵게** · *기울임* · ~~취소선~~<br># 제목 · - 목록 · &gt; 인용<br>[링크 이름](https://주소)<br>`코드` · 코드 블록: &#96;&#96;&#96;python<br>빈 줄로 문단을 나눌 수 있습니다.<br>HTML과 스크립트는 실행하지 않습니다.</span></span>' : "댓글"}<textarea name="body" required maxlength="10000" rows="4" placeholder="서로를 존중하며 이야기를 나눠주세요."></textarea></label><div class="guest-fields"><label>닉네임<input name="nickname" required maxlength="40" autocomplete="nickname" placeholder="닉네임"></label><label>비밀번호<input name="password" type="password" maxlength="128" autocomplete="new-password" placeholder="수정·삭제용 · 비워도 됩니다"></label></div><div class="guest-honeypot" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><p class="editor-note">비밀번호를 비우면 누구나 빈 비밀번호로 이 글을 수정·삭제할 수 있습니다.</p><button class="black-btn">${scope === "guestbook" ? "방명록 등록" : "댓글 등록"} ↗</button><p class="guest-status" role="status"></p></form><div class="guest-list" aria-live="polite"></div><button type="button" class="outline-btn guest-more" hidden>더 보기</button><dialog class="guest-delete-dialog"><div class="dialog-head"><h3>글 삭제</h3><button type="button" class="guest-delete-close" aria-label="닫기">✕</button></div><form><label>작성할 때 입력한 비밀번호 · 빈 비밀번호도 가능<input name="password" type="password" maxlength="128" autocomplete="off"></label><p class="guest-delete-status" role="status"></p><button class="black-btn">삭제</button></form></dialog></section>`;
  const mainForm = node.querySelector(".guest-compose"),
    list = node.querySelector(".guest-list"),
    more = node.querySelector(".guest-more");
  let offset = 0,
    deleteId = null,
    loadVersion = 0,
    editMode = false;
  const entries = new Map(),
    openReplies = new Set(),
    replyPages = new Map();
  async function invoke(body) {
    const { data, error } = await client.functions.invoke(
      "guest-interactions",
      { body },
    );
    if (error) throw Error(await guestErrorCode(error));
    if (data?.error) throw Error(data.error);
    return data;
  }
  const errorText = (e) =>
    messages[e.message] || "처리하지 못했습니다. 잠시 후 다시 시도하세요.";
  const query = () => {
    let q = client
      .from("guest_entries")
      .select("*")
      .eq("scope", scope)
      .is("deleted_at", null);
    if (scope === "comment") q = q.eq("blog_slug", slug);
    if (scope === "thread") q = q.eq("thread_id", thread);
    return q;
  };
  function renderEntry(e, child = false) {
    return `<article class="guest-entry ${child ? "guest-reply" : ""}" data-guest-id="${esc(e.id)}"><div class="entry-meta"><strong>${esc(e.author_name)}</strong><time>${esc(stamp(e.created_at))}</time>${modifiedDate(e.edited_at) ? `<time class="edited-label" datetime="${esc(e.edited_at)}">${esc(modifiedDate(e.edited_at))} 수정됨</time>` : ""}</div>${e.reply_to_name ? `<span class="reply-to">↳ ${esc(e.reply_to_name)}님에게</span>` : ""}${scope === "guestbook" ? `<div class="visitor-markdown article-body">${renderMarkdown(e.body)}</div>` : `<p class="visitor-body">${esc(e.body)}</p>`}<div class="guest-actions"><button type="button" data-guest-vote="${esc(e.id)}" aria-label="${esc(e.author_name)} 글 추천">♡ 추천 <span>${Number(e.likes) || 0}</span></button><button type="button" data-guest-reply="${esc(e.id)}" data-reply-name="${esc(e.author_name)}">답글</button><button type="button" data-guest-edit="${esc(e.id)}">수정</button><button type="button" data-guest-delete="${esc(e.id)}">비밀번호로 삭제</button>${admin ? `<button type="button" data-guest-admin="${esc(e.id)}" data-admin-private>관리자 삭제</button><button type="button" data-guest-ban="${esc(e.id)}" data-admin-private>접속 차단</button><button type="button" data-guest-unban="${esc(e.id)}" data-admin-private>차단 해제</button>` : ""}<span class="guest-action-status" role="status"></span></div><div class="guest-reply-form"></div></article>`;
  }
  function repliesLabel(root, open) {
    const count = entries.get(root)?.reply_count;
    return `답글 ${Number.isInteger(count) ? count + "개 " : ""}${open ? "접기" : "펼치기"}`;
  }
  function renderRoot(e) {
    return `<div class="guest-thread" data-root="${esc(e.id)}">${renderEntry(e)}<button type="button" class="guest-replies-toggle" data-replies-toggle="${esc(e.id)}" aria-expanded="${openReplies.has(e.id)}">${repliesLabel(e.id, openReplies.has(e.id))}</button><div class="guest-replies" data-replies="${esc(e.id)}" ${openReplies.has(e.id) ? "" : "hidden"}><div class="guest-replies-list"></div><button type="button" class="outline-btn guest-replies-more" data-replies-more="${esc(e.id)}" hidden>답글 더 보기</button></div></div>`;
  }
  async function loadReplies(root, reset = false) {
    const area = list.querySelector(`[data-replies="${CSS.escape(root)}"]`);
    if (!area) return;
    let page = replyPages.get(root);
    if (page?.loading && !reset) return;
    if (!page || reset) {
      page = { offset: 0, loaded: false, loading: false };
      replyPages.set(root, page);
    }
    const container = area.querySelector(".guest-replies-list"),
      button = area.querySelector(".guest-replies-more");
    if (reset) container.replaceChildren();
    page.loading = true;
    button.disabled = true;
    try {
      const { data, error } = await query()
        .eq("root_id", root)
        .not("parent_id", "is", null)
        .order("created_at")
        .order("id")
        .range(page.offset, page.offset + 49);
      if (error) throw error;
      if (!area.isConnected || replyPages.get(root) !== page) return;
      if (!page.offset) container.replaceChildren();
      for (const e of data) {
        entries.set(e.id, e);
        container.insertAdjacentHTML("beforeend", renderEntry(e, true));
      }
      if (!data.length && !page.offset)
        container.innerHTML =
          '<p class="editor-note">아직 답글이 없습니다.</p>';
      page.offset += data.length;
      page.loaded = true;
      button.hidden = data.length < 50;
      mountCodeTools(container);
      bindActions();
    } catch {
      if (area.isConnected) {
        button.hidden = false;
        button.textContent = "답글 다시 불러오기";
      }
    } finally {
      page.loading = false;
      button.disabled = false;
    }
  }
  async function refreshEntry(id) {
    const { data, error } = await query().eq("id", id).maybeSingle();
    if (error) throw Error("GUEST_REQUEST_FAILED");
    if (!data) return;
    entries.set(id, data);
    const current = list.querySelector(`[data-guest-id="${CSS.escape(id)}"]`);
    if (current) {
      current.outerHTML = renderEntry(data, !!data.parent_id);
      mountCodeTools(list);
    }
    const toggle = list.querySelector(
      `[data-replies-toggle="${CSS.escape(id)}"]`,
    );
    if (toggle) toggle.textContent = repliesLabel(id, openReplies.has(id));
    bindActions();
  }
  async function load(reset = false) {
    const version = ++loadVersion;
    if (reset) {
      offset = 0;
      list.replaceChildren();
      entries.clear();
      replyPages.clear();
    }
    more.disabled = true;
    try {
      const { data: roots, error } = await query()
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + 19);
      if (error) throw Error("GUEST_SETUP_REQUIRED");
      if (!node.isConnected || version !== loadVersion) return;
      if (!offset && !roots.length)
        list.innerHTML = '<p class="empty">첫 번째 기록을 남겨보세요.</p>';
      for (const e of roots) {
        entries.set(e.id, e);
        list.insertAdjacentHTML("beforeend", renderRoot(e));
      }
      offset += roots.length;
      more.hidden = roots.length < 20;
      mountCodeTools(list);
      bindActions();
      for (const e of roots) if (openReplies.has(e.id)) void loadReplies(e.id);
    } catch (e) {
      if (node.isConnected && version === loadVersion)
        list.textContent = errorText(e);
    } finally {
      if (node.isConnected) more.disabled = false;
    }
  }
  function bindCompose(form, parent = null) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const button = form.querySelector("button[type=submit],button.black-btn");
      button.disabled = true;
      const status = form.querySelector(".guest-status");
      try {
        await invoke({
          action: "create",
          scope,
          slug,
          thread,
          parent,
          name: form.elements.nickname.value,
          password: form.elements.password.value,
          body: form.elements.body.value,
          website: form.elements.website?.value || "",
        });
        form.reset();
        status.textContent = "등록했습니다.";
        if (parent) {
          const root = entries.get(parent)?.root_id || parent;
          openReplies.add(root);
          const area = list.querySelector(
            `[data-replies="${CSS.escape(root)}"]`,
          );
          if (area) area.hidden = false;
          await Promise.all([refreshEntry(root), loadReplies(root, true)]);
          list
            .querySelector(`[data-replies-toggle="${CSS.escape(root)}"]`)
            ?.setAttribute("aria-expanded", "true");
        } else await load(true);
      } catch (err) {
        status.textContent = errorText(err);
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    };
  }
  function bindActions() {
    list
      .querySelectorAll("[data-replies-more]")
      .forEach((b) => (b.onclick = () => loadReplies(b.dataset.repliesMore)));
    list.querySelectorAll("[data-replies-toggle]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.repliesToggle,
            area = b.nextElementSibling;
          area.hidden = !area.hidden;
          b.setAttribute("aria-expanded", String(!area.hidden));
          b.textContent = repliesLabel(id, !area.hidden);
          if (area.hidden) openReplies.delete(id);
          else {
            openReplies.add(id);
            if (!replyPages.get(id)?.loaded) void loadReplies(id);
          }
        }),
    );
    list
      .querySelectorAll("[data-guest-edit]")
      .forEach(
        (b) => (b.onclick = () => openDialog(b.dataset.guestEdit, true)),
      );
    list.querySelectorAll("[data-guest-vote]").forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          const status = b
            .closest(".guest-actions")
            .querySelector(".guest-action-status");
          try {
            const result = await invoke({
              action: "vote",
              id: b.dataset.guestVote,
            });
            b.querySelector("span").textContent = String(result.likes);
            b.setAttribute("aria-pressed", "true");
            status.textContent = result.already
              ? "동일 접속에서 이미 추천한 글입니다."
              : "추천했습니다.";
          } catch (e) {
            status.textContent = errorText(e);
            b.disabled = false;
          }
        }),
    );
    list.querySelectorAll("[data-guest-reply]").forEach(
      (b) =>
        (b.onclick = () => {
          const target = b
            .closest(".guest-entry")
            .querySelector(".guest-reply-form");
          if (target.childElementCount) {
            target.replaceChildren();
            b.setAttribute("aria-expanded", "false");
            return;
          }
          target.innerHTML = `<form class="stack-form guest-compose-reply"><label>${esc(b.dataset.replyName)}님에게 답글<textarea name="body" rows="3" required maxlength="10000"></textarea></label><div class="guest-fields"><label>닉네임<input name="nickname" required maxlength="40" autocomplete="nickname"></label><label>비밀번호<input name="password" type="password" maxlength="128" autocomplete="new-password" placeholder="수정·삭제용 · 비워도 됩니다"></label></div><button type="submit" class="black-btn">답글 등록 ↗</button><p class="guest-status" role="status"></p></form>`;
          b.setAttribute("aria-expanded", "true");
          bindCompose(target.querySelector("form"), b.dataset.guestReply);
          target.querySelector("textarea").focus();
        }),
    );
    list
      .querySelectorAll("[data-guest-delete]")
      .forEach(
        (b) => (b.onclick = () => openDialog(b.dataset.guestDelete, false)),
      );
    for (const [selector, action, key] of [
      ["[data-guest-admin]", "admin-delete", "guestAdmin"],
      ["[data-guest-ban]", "admin-ban", "guestBan"],
      ["[data-guest-unban]", "admin-unban", "guestUnban"],
    ])
      list.querySelectorAll(selector).forEach(
        (b) =>
          (b.onclick = async () => {
            if (!(await authorize())) return;
            if (
              !confirm(
                action === "admin-ban"
                  ? "이 글 작성자의 접속 정보를 기준으로 새 등록과 추천을 차단할까요?"
                  : action === "admin-unban"
                    ? "이 글 작성자의 접속 차단을 해제할까요?"
                    : "이 글을 삭제할까요?",
              )
            )
              return;
            b.disabled = true;
            try {
              const result = await invoke({ action, id: b.dataset[key] });
              if (action === "admin-ban")
                b
                  .closest(".guest-actions")
                  .querySelector(".guest-action-status").textContent =
                  result.banned ? "차단했습니다." : "이미 차단된 접속입니다.";
              else if (action === "admin-unban")
                b
                  .closest(".guest-actions")
                  .querySelector(".guest-action-status").textContent =
                  result.unbanned
                    ? "차단을 해제했습니다."
                    : "차단된 접속이 아닙니다.";
              else await load(true);
            } catch (e) {
              if (b.isConnected)
                b
                  .closest(".guest-actions")
                  .querySelector(".guest-action-status").textContent =
                  errorText(e);
            } finally {
              if (b.isConnected) b.disabled = false;
            }
          }),
      );
  }
  function openDialog(id, editing) {
    deleteId = id;
    editMode = editing;
    const d = node.querySelector(".guest-delete-dialog");
    d.querySelector("form").reset();
    d.querySelector("h3").textContent = editing ? "글 수정" : "글 삭제";
    d.querySelector("form .black-btn").textContent = editing
      ? "수정 저장"
      : "삭제";
    d.querySelector(".guest-edit-body").hidden = !editing;
    d.querySelector("textarea").value = entries.get(id)?.body || "";
    d.querySelector("textarea").required = editing;
    d.querySelector(".guest-delete-status").textContent = "";
    d.showModal();
  }
  const dialog = node.querySelector(".guest-delete-dialog");
  dialog
    .querySelector("form")
    .insertAdjacentHTML(
      "afterbegin",
      '<label class="guest-edit-body" hidden>내용<textarea name="body" rows="6" maxlength="10000"></textarea></label>',
    );
  dialog.querySelector(".guest-delete-close").onclick = () => dialog.close();
  dialog.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.target.querySelector("button");
    button.disabled = true;
    try {
      await invoke({
        action: editMode ? "edit" : "delete",
        id: deleteId,
        password: e.target.elements.password.value,
        ...(editMode ? { body: e.target.elements.body.value } : {}),
      });
      dialog.close();
      e.target.reset();
      if (editMode) await refreshEntry(deleteId);
      else {
        const removed = entries.get(deleteId);
        if (removed?.parent_id) {
          list
            .querySelector(`[data-guest-id="${CSS.escape(deleteId)}"]`)
            ?.remove();
          entries.delete(deleteId);
          const page = replyPages.get(removed.root_id);
          if (page) page.offset = Math.max(0, page.offset - 1);
          await refreshEntry(removed.root_id);
        } else {
          list.querySelector(`[data-root="${CSS.escape(deleteId)}"]`)?.remove();
          entries.delete(deleteId);
          replyPages.delete(deleteId);
          openReplies.delete(deleteId);
          offset = Math.max(0, offset - 1);
          if (!list.querySelector(".guest-thread"))
            list.innerHTML = '<p class="empty">첫 번째 기록을 남겨보세요.</p>';
        }
      }
    } catch (err) {
      dialog.querySelector(".guest-delete-status").textContent = errorText(err);
    } finally {
      button.disabled = false;
    }
  };
  bindCompose(mainForm);
  more.onclick = () => load();
  await load();
}
