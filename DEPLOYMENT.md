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

## 4. 무료 Google 로그인 연결

블로그 회원/운영자는 Google 계정으로 로그인합니다. **메일 발송 서비스·도메인 구매·SMTP 설정이 필요 없습니다.** Supabase는 Free 요금제를 유지합니다. Google OAuth 설정에는 유료 API나 결제 계정 연결이 필요하지 않습니다. 무료 체험/크레딧 신청이나 카드 등록을 진행하지 않습니다.

1. Supabase **Authentication → URL Configuration**에서 Site URL을 `https://rihoyo.github.io/buiing_blog/`로 설정합니다.
2. Redirect URLs에는 `https://rihoyo.github.io/buiing_blog/**`를 추가합니다.
3. Supabase **Authentication → Sign In / Providers → Google**에서 표시되는 **Callback URL**을 복사합니다. 보통 `https://프로젝트ID.supabase.co/auth/v1/callback`입니다.
4. https://console.cloud.google.com/ 에서 OAuth 설정을 위한 프로젝트를 만듭니다. 결제 계정을 연결하지 않습니다.
5. **Google Auth Platform**에서 앱 이름(`BUIING Blog`), 사용자 지원 이메일, 개발자 연락처를 등록합니다. 외부 방문자를 받으려면 Audience는 **External**입니다. Google 계정 기본 정보에 해당하는 `openid`, `email`, `profile`만 사용하며 Gmail/Drive 등 추가 권한은 요청하지 않습니다.
6. 테스트 중에는 Audience의 **Test users**에 본인의 구글 이메일을 추가합니다. 일반 방문자에게 열 때는 **Publish app / In production**으로 전환해야 합니다. 화면에서 도메인 확인 등 추가 요구가 나오면 임의로 진행하지 말고 해당 화면을 확인합니다.
7. **Clients → Create client → Web application**을 선택합니다.
   - Authorized JavaScript origins: `https://rihoyo.github.io`
   - Authorized redirect URIs: 3번에서 복사한 **Supabase Callback URL** (블로그 주소가 아님)
8. 생성된 **Client ID**와 **Client secret**을 Supabase의 Google 제공자 설정에 입력하고 활성화합니다. Client secret은 Supabase에만 입력합니다. 채팅·저장소·site.config.json에 넣지 않습니다.
9. 사이트에서 **로그인 → Google 계정으로 계속하기**를 눌러 테스트합니다.

기본 로그인은 Google 하나입니다. PKCE 인증 흐름을 사용하며, Google로 로그인했다는 이유만으로 관리자 권한을 부여하지 않습니다. 아래 단계에서 소유자의 계정만 관리자로 등록합니다.

이메일 OTP는 선택 기능으로 남아 있지만 기본 화면에는 나타나지 않습니다. 본 구성에서는 이를 활성화하거나 유료 SMTP를 연결할 필요가 없습니다.

## 5. 본인 계정을 관리자로 지정

1. 사이트의 **로그인 → Google 계정으로 계속하기**로 본인 계정의 로그인을 한 번 완료합니다.
2. `supabase/grant-admin.sql`의 `YOUR_ADMIN_EMAIL@example.com`을 **Supabase Authentication → Users에서 본인 계정에 표시된 이메일**로 바꿉니다.
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
- 기본 구성은 무료 Google 로그인 + Supabase Free + 공개 저장소의 GitHub Pages입니다. 유료 플랜이나 유료 메일 서비스는 연결하지 않습니다.

## 관리자와 일반 회원의 경계

| 기능 | 비로그인 | 일반 회원 | 운영자 |
| --- | --- | --- | --- |
| 블로그/공개 커뮤니티 읽기 | 가능 | 가능 | 가능 |
| 댓글/커뮤니티 글 작성 | 불가 | 가능 | 가능 |
| 본인 댓글/커뮤니티 글 삭제 | 불가 | 가능 | 가능 |
| 블로그 편집기/초안/파일 다운로드 | 불가 | 불가 | 가능 |
| 타인 글 삭제·차단·필터·관리 기록 | 불가 | 불가 | 가능 |

일반 화면에는 로그인만 표시합니다. 글쓰기/관리자 메뉴는 DB의 관리자 권한을 확인한 계정에만 표시합니다. 편집기는 관리자 화면에서만 생성되며 열기·초안 저장·다운로드 때 권한을 다시 검사합니다. 로그아웃 또는 권한 거부 시 편집기와 관리 내용을 제거합니다. 초안 저장 키는 사용자 ID별로 분리합니다.

블로그 공개 발행은 기존과 같이 운영자가 다운로드한 파일을 GitHub 저장소 `posts/`에 커밋하는 방식입니다. 브라우저에서 직접 배포하는 API는 없으며 일반 회원의 community API는 `thread`/`comment`만 허용합니다. GitHub 저장소의 쓰기 권한은 운영자에게만 부여하세요.

GitHub Pages는 정적 호스팅이므로 `/admin/` 주소의 HTML/공개 JavaScript 파일 요청을 서버에서 403으로 거부할 수 없습니다. 그 HTML에는 관리 데이터/편집기 폼이 없으며, 일반 회원은 접근 거부 화면만 봅니다. 실제 관리 데이터와 변경 권한은 Supabase 함수/RLS에서 차단합니다. HTML 요청 자체까지 로그인 뒤에만 허용하려면 인증을 검사하는 별도의 서버/호스팅으로 옮겨야 합니다.
