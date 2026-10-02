# 처음 공개하는 순서

사이트 예정 주소: https://rihoyo.github.io/buiing_blog/
관리자 주소: https://rihoyo.github.io/buiing_blog/admin/

## 1. GitHub Pages 켜기

1. https://github.com/rihoyo/buiing_blog/settings/pages 를 엽니다.
2. Build and deployment → Source에서 **GitHub Actions**를 선택합니다.
3. https://github.com/rihoyo/buiing_blog/actions 에서 **Deploy blog to GitHub Pages** → **Run workflow**를 누릅니다.
4. 작업이 초록색으로 완료되면 사이트 주소를 엽니다. 익명/시크릿 창에서도 접속되는지 확인합니다.

GitHub 요금제에 따라 비공개 저장소의 Pages 사용이 제한될 수 있습니다. 이 경우 저장소 공개 전환은 소유자가 선택해야 합니다. 저장소 공개 범위를 자동 변경하지 않습니다.

## 2. Supabase 프로젝트 만들기

1. https://supabase.com/dashboard 에서 로그인합니다.
2. **New project**를 선택하고 조직을 선택/생성합니다.
3. 프로젝트 이름은 `buiing-blog`, 지역은 Seoul 또는 가까운 지역을 선택합니다. DB 비밀번호는 비밀번호 관리 도구에 보관합니다.
4. 생성이 끝나면 프로젝트의 **Connect** 또는 **Settings → API / API Keys**에서 다음 공개 설정을 확인합니다. UI 버전에 따라 메뉴 이름이 다를 수 있습니다.
   - Project URL: `https://프로젝트ID.supabase.co`
   - **Publishable key**: `sb_publishable_...` 또는 legacy **anon** key
5. 두 값은 사이트 공개 연결 설정입니다. Codex에 두 값을 전달하면 `site.config.json`에 반영할 수 있습니다. **DB 비밀번호·secret key·service_role key는 전달하거나 이 파일에 넣지 마세요.**

직접 넣는 경우 `site.config.json`의 `supabaseUrl`, `supabasePublishableKey`만 채우고 저장합니다. 또는 GitHub 저장소 Settings → Secrets and variables → Actions → Variables에 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`를 설정합니다. GitHub Actions가 해당 값을 빌드에 적용합니다.

## 3. 데이터베이스 설치 — 한 번만

1. Supabase 왼쪽 **SQL Editor** → **New query**를 누릅니다.
2. 이 저장소의 `supabase/schema.sql` 전체 내용을 복사해 붙여넣고 **Run**을 누릅니다.
3. 성공 결과를 확인합니다. 설치 스크립트는 최초 1회용입니다. 이미 설치한 뒤 전체 파일을 다시 실행하지 마세요. 기존 테이블이 있다는 오류가 나면 임의로 테이블을 삭제하지 말고 오류를 알려주세요.

권한 검사는 DB에서 수행됩니다. 공개 사용자는 읽기만 가능하며, 인증된 사용자도 승인된 함수로만 작성/삭제할 수 있습니다. 관리자 권한은 별도 비공개 테이블로 관리합니다.

## 4. 이메일 로그인 설정

1. Supabase **Authentication → URL Configuration**의 Site URL을 `https://rihoyo.github.io/buiing_blog/`로 설정합니다.
2. **Authentication → Providers / Sign In**에서 Email 로그인을 켜고 이메일 확인을 유지합니다.
3. **Authentication → Email Templates**에서 **Magic Link**, **Confirm signup** 본문에 아래 코드를 포함하도록 설정합니다. 로그인 화면은 링크 대신 메일의 숫자 코드를 받습니다.

```html
<h2>BUIING 로그인 인증</h2>
<p>아래 코드를 로그인 화면에 입력해 주세요.</p>
<p>{{ .Token }}</p>
<p>본인이 요청하지 않았다면 무시해 주세요.</p>
```

4. **실제 외부 방문자에게 메일을 보내려면 SMTP 설정이 필요합니다.** Supabase 기본 메일 발송은 프로젝트 조직 구성원 등으로 수신자가 제한되고 테스트 용량도 낮습니다. 관리자 한 명이 로그인되었다고 공개 방문자 인증이 준비된 것은 아닙니다.
5. Supabase **Authentication → Email / SMTP Settings**에서 사용 중인 이메일 발송 서비스의 SMTP host/port/username/password와 검증된 발신 주소를 등록합니다. 해당 서비스의 도메인/발신자 인증도 완료해야 합니다. SMTP 비밀번호는 Supabase 설정에만 넣습니다. 메일 발송 서비스를 아직 사용하지 않는다면 관리자 테스트까지 먼저 진행하고, 방문자 오픈 전에 서비스 선택과 설정을 추가로 진행하세요.
6. 별도의 방문자 이메일로 코드 수신·로그인을 확인합니다. 메일 서비스의 발송 제한을 고려해 Auth rate limit을 설정합니다. 공개 규모가 커지면 CAPTCHA 연동도 추가할 수 있습니다(현재 미구현).

## 5. 본인 계정을 관리자로 지정

1. 사이트의 **커뮤니티 → 로그인 / 가입**에서 본인의 이메일로 인증 로그인을 한 번 완료합니다.
2. `supabase/grant-admin.sql`의 `YOUR_ADMIN_EMAIL@example.com`을 **방금 로그인한 이메일**로 바꿉니다.
3. Supabase SQL Editor에서 수정한 SQL을 실행합니다.
4. https://rihoyo.github.io/buiing_blog/admin/ 을 새로고침합니다.
5. 금칙어 설정, 글/댓글 삭제, 작성자 차단, 차단 해제가 표시되는지 확인합니다.

이메일 주소를 프로필에 적는 것만으로 관리자 권한을 얻을 수는 없습니다. 확인된 사용자 계정에 SQL Editor로 권한을 부여해야 합니다.

## 6. 구글 검색 등록

1. https://search.google.com/search-console 에 로그인합니다.
2. **속성 추가 → URL 접두어**에 `https://rihoyo.github.io/buiing_blog/`를 입력합니다.
3. **HTML 태그** 인증을 선택합니다. 제공되는 `google-site-verification` 메타 태그를 `index.html`의 `<head>`에 추가하고 배포한 뒤 **확인**을 누릅니다. 태그를 전달하면 Codex가 삽입할 수 있습니다.
4. **Sitemaps**에 `https://rihoyo.github.io/buiing_blog/sitemap.xml`을 제출합니다.
5. **URL 검사**에 첫 게시글 주소를 입력하고 **색인 생성 요청**을 선택합니다.

예시: https://rihoyo.github.io/buiing_blog/posts/react-thinking/

게시글은 JavaScript 없이 본문을 읽을 수 있는 HTML이며 canonical, Open Graph, BlogPosting 구조화 데이터가 포함됩니다. 공개 배포는 즉시 외부 링크 접근을 가능하게 하지만, 구글의 수집 시점·색인 여부·순위는 보장되지 않습니다. 샘플 글은 본인 글로 교체하는 것을 권장합니다. 커뮤니티 글은 동적으로 불러오며 이번 SEO 정적 생성 대상은 블로그 글입니다.

## 운영 범위

- 차단은 로그인 계정 단위의 **새 글/댓글 작성 제한**입니다. IP 차단은 아니며, 기존 글은 별도로 삭제합니다.
- 삭제한 게시물은 공개 목록에서 숨겨지고 관리자에게는 삭제 상태로 표시됩니다. 게시판 원글을 삭제하면 그 댓글도 함께 숨깁니다.
- 금칙어는 제목·본문을 대소문자 구분 없이 문자 그대로 검사합니다. 단어 변형/띄어쓰기 우회까지 판별하는 AI 필터는 아닙니다.
- 필터 수정은 새로 등록하는 글/댓글부터 적용됩니다. 기존 게시물에는 소급 적용하지 않습니다.
- 댓글과 방문자 글은 Supabase에 저장됩니다. 브라우저 저장소에만 남는 데모가 아닙니다.
- 블로그 본문은 `posts/*.json`으로 발행합니다. 관리자 화면의 게시물 관리는 방문자 게시글/댓글에 해당합니다.
- SMTP, 인증, DB 백업과 서비스 요금/사용량은 계정 소유자가 관리합니다.
