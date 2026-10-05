import { createAdminApi } from "./admin-api.js";
import { escapeHTML as esc } from "./helpers.js";
export function mountAdminDashboard(
  dashboard,
  { node, entry, date, rpc, authorize, refresh, errorText },
) {
  const $ = (selector) => node.querySelector(selector);
  const api = createAdminApi(rpc);
  const labels = {
    recommend: "추천",
    guest_create: "비회원 등록",
    thread_submit: "회원 글 제출",
    member_edit: "회원 글 수정",
    member_comment: "회원 댓글",
    thread_approved: "승인",
    thread_rejected: "거절",
    member_delete: "회원 글 삭제",
    edit: "수정",
    delete: "삭제",
    admin_delete: "관리자 삭제",
    password_rejected: "비밀번호 실패",
  };
  const pending = $("#approval-list"),
    stats = $("#community-stats"),
    logs = $("#activity-list");
  let before = null;
  if (!dashboard) {
    for (const n of [pending, stats, logs])
      n.textContent = "커뮤니티 업데이트 SQL 적용이 필요합니다.";
    return;
  }
  function paintStats(values) {
    stats.innerHTML =
      '<div class="stats-grid">' +
      Object.entries({
        threads: "공개 회원 글",
        pending: "승인 대기",
        guestbook: "방명록",
        comments: "비회원 댓글",
        recommendations: "추천",
        members: "작성 회원",
        today: "오늘 활동",
      })
        .map(
          ([key, label]) =>
            `<div><span>${label}</span><strong>${Number(values?.[key]) || 0}</strong></div>`,
        )
        .join("") +
      "</div>";
  }
  paintStats(dashboard.stats);
  stats.insertAdjacentHTML(
    "afterend",
    '<button type="button" class="outline-btn" id="refresh-community-stats">통계 새로고침</button><span id="community-stats-status" role="status"></span>',
  );
  $("#refresh-community-stats").onclick = async (e) => {
    const button = e.currentTarget;
    if (!(await authorize())) return;
    button.disabled = true;
    try {
      const values = await api.stats();
      if (!node.isConnected || !$("#community-stats")) return;
      paintStats(values);
      $("#community-stats-status").textContent = "방금 갱신했습니다.";
    } catch {
      if (node.isConnected && $("#community-stats-status"))
        $("#community-stats-status").textContent =
          "통계를 갱신하지 못했습니다.";
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  };
  pending.innerHTML =
    (dashboard.pending || [])
      .map(
        (e) =>
          `<article class="approval-entry">${entry(e, true)}<button type="button" class="black-btn" data-approve="${esc(e.id)}">승인</button><button type="button" class="outline-btn" data-reject="${esc(e.id)}">거절</button><p role="status"></p></article>`,
      )
      .join("") || "<p>승인 대기 글이 없습니다.</p>";
  for (const [selector, approved, key] of [
    ["[data-approve]", true, "approve"],
    ["[data-reject]", false, "reject"],
  ])
    pending.querySelectorAll(selector).forEach(
      (b) =>
        (b.onclick = async () => {
          if (!(await authorize())) return;
          b.disabled = true;
          try {
            await rpc("admin_moderate_thread", {
              p_id: b.dataset[key],
              p_approved: approved,
            });
            await refresh();
          } catch (e) {
            b
              .closest(".approval-entry")
              .querySelector("[role=status]").textContent = errorText(e);
            b.disabled = false;
          }
        }),
    );
  function paint(rows, reset = false) {
    if (reset) logs.replaceChildren();
    logs.insertAdjacentHTML(
      "beforeend",
      rows
        .map(
          (a) =>
            `<article class="activity-row"><time>${esc(date(a.created_at))}</time><strong>${esc(labels[a.action] || a.action)}</strong><span>${esc(a.author_name || "")} · ${esc(a.scope || "")}</span><code>대상: ${esc(a.target || "")}</code><code>계정: ${esc(a.actor_id || "—")}</code><code>접속: ${esc(a.network_key || "—")}</code></article>`,
        )
        .join("") || (!before ? "<p>활동 기록이 없습니다.</p>" : ""),
    );
    before = rows.at(-1)?.id || before;
    $("#activity-more").hidden = rows.length < 50;
  }
  paint(dashboard.activity || [], true);
  async function load(reset = false) {
    if (!(await authorize())) return;
    const form = $("#activity-filter");
    try {
      const rows = await api.activity({
        p_before: reset ? null : before,
        p_actor: form.actor.value.trim() || null,
        p_action: form.action.value || null,
      });
      if (!node.isConnected || !$("#community-stats")) return;
      if (reset) before = null;
      paint(rows, reset);
    } catch {
      logs.textContent = "활동 로그를 불러오지 못했습니다.";
    }
  }
  $("#activity-filter").onsubmit = (e) => {
    e.preventDefault();
    void load(true);
  };
  $("#activity-more").onclick = () => load();
}
