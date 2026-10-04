기존 설치 사용자는 [즉시 반영·썸네일 업그레이드](INSTANT-PUBLISHING-SETUP.md)를 적용하세요. 토큰 재발급은 필요 없습니다.

# 게시 버튼 연결 — 처음 한 번만

블로그의 ‘포스트 게시’는 관리자 로그인 → Supabase 게시 함수 → GitHub 글 저장 → GitHub Pages 배포 순서로 동작합니다. 이후 수정도 같은 버튼으로 처리합니다. 다운로드하거나 posts 폴더에 글 파일을 직접 넣지 않습니다. 즉시 반영 업그레이드 후에는 공개 글 저장이 완료되면 바로 확인할 수 있고, 검색용 정적 HTML은 별도로 배포됩니다. 업그레이드 전에는 Pages 배포 완료를 기다립니다.

공개 저장소의 GitHub Actions와 Supabase Free 범위에서 동작합니다. 유료 플랜이나 결제 수단을 추가할 필요는 없습니다. 무료 저장 공간/함수 사용량의 한도는 적용됩니다. 이미지/GIF는 Supabase Storage에 저장됩니다.

## 1. 블로그 파일 적용

자동 업로드가 되지 않을 때:

1. 제공된 ZIP을 다운로드하고 압축을 풉니다.
2. https://github.com/rihoyo/buiing_blog/upload/main 을 엽니다.
3. 압축을 푼 폴더 **안의 내용 전체**를 끌어놓습니다. ZIP 자체나 바깥 폴더를 올리지 않습니다. scripts, assets, supabase 폴더도 함께 올립니다.
4. 아래 Commit changes를 누릅니다. https://github.com/rihoyo/buiing_blog/actions 에서 가장 위 배포가 초록색인지 확인합니다.

## 2. 이미지 저장소 설치

1. Supabase → SQL Editor → New query를 엽니다.
2. `supabase/publishing.sql`의 내용을 모두 붙여넣고 Run을 누릅니다.
3. `Success. No rows returned`가 나오면 완료입니다. 기존 schema.sql은 다시 실행하지 않습니다.

## 3. 게시용 함수 설치

1. Supabase 프로젝트 왼쪽 **Edge Functions**를 엽니다.
2. **Deploy a new function → Via Editor / Open Editor**를 선택합니다. 화면 명칭이 다르면 화면을 공유하면 다음 위치를 안내할 수 있습니다.
3. 함수 이름은 정확히 `publish-post`로 입력합니다.
4. 기본 코드를 모두 지우고 `supabase/functions/publish-post/index.ts`의 전체 내용을 붙여넣습니다.
5. Deploy function을 누릅니다.
6. 함수 설정의 **Verify JWT / Enforce JWT verification** 스위치를 끕니다. 코드 자체에서 Supabase Auth로 로그인 토큰을 검증하고 `is_admin` 권한을 확인합니다. 이 검증을 삭제하지 마세요. CLI를 사용하면 저장소의 supabase/config.toml에 동일한 설정이 있습니다.

## 4. GitHub에서 이 블로그에만 쓰기 권한 발급

1. https://github.com/settings/personal-access-tokens/new 를 엽니다. GitHub가 비밀번호를 요구하면 본인 계정으로 확인합니다.
2. Token name: `buiing-blog-publisher`
3. Resource owner: `rihoyo`
4. Expiration: 운영할 기간을 선택합니다. 만료되면 아래 Supabase Secret을 새 토큰으로 교체해야 합니다.
5. Repository access: **Only select repositories** → **buiing_blog**만 선택합니다.
6. Repository permissions: **Contents → Read and write**를 선택합니다. Metadata Read는 자동 포함됩니다. Actions, Administration, Workflows 등의 추가 권한은 필요 없습니다.
7. Generate token을 누르고 표시되는 토큰을 복사합니다. **채팅, GitHub 파일, 블로그 입력칸에 붙여넣지 않습니다.**

## 5. 토큰을 Supabase Secret에만 저장

1. Supabase → Edge Functions → **Secrets**를 엽니다.
2. 이름: `BLOG_GITHUB_TOKEN`
3. 값: 방금 복사한 GitHub 토큰을 붙여넣고 저장합니다.
4. SUPABASE_URL, SUPABASE_ANON_KEY는 Supabase가 함수에 제공하는 기본 환경 변수입니다. 별도로 수정하지 않습니다.

이 토큰은 Supabase 서버 안에서만 사용합니다. 브라우저에는 전달되지 않습니다. 비회원·일반 회원은 게시 함수 호출 권한이 없으며, 호출마다 관리자 여부를 검증합니다.

## 6. 즉시 반영 설치

SQL Editor에서 `supabase/instant-publishing.sql` 전체를 실행합니다. 관리자 쓰기·공개 읽기 정책과 최신 글 동기화 함수를 설치합니다. 자세한 화면 순서는 [즉시 반영 설치 안내](INSTANT-PUBLISHING-SETUP.md)를 확인하세요.

## 7. 확인

1. 블로그에서 관리자 계정으로 Google 로그인합니다.
2. 글쓰기 → 제목/본문 → **포스트 게시**를 누릅니다.
3. 저장 후 게시 완료가 표시되고, 새 글이나 수정된 본문을 다른 브라우저에서도 읽을 수 있는지 확인합니다. 즉시 반영이 미설정이면 정적 배포 대기 안내가 표시됩니다. 2분 이상 걸리면 표시된 ‘배포 상태 확인’ 링크를 엽니다. GitHub 실패를 게시 성공으로 표시하지 않습니다.
4. 게시글 본문의 **게시글 수정**으로 제목이나 본문을 바꾸고 **수정 사항 게시**를 누릅니다. 원래 URL은 유지됩니다.

## 임시저장과 본문 편집

- ‘임시저장 목록’에서 제목과 저장 시각을 확인하고 불러오기/삭제를 선택합니다.
- 각 초안은 별도 기록입니다. 새로 글쓰기에 들어오면 새 글 화면이 열리고, 이전 초안은 목록에서 선택합니다.
- 자동 임시저장을 끄면 수동 버튼만 저장합니다. 켜면 변경이 있는 경우에만 설정한 주기(5초~5분)로 저장합니다. 저장된 내용과 같으면 저장 버튼이 비활성화됩니다.
- 자동 저장과 별도로 수동 저장 버튼을 사용할 수 있습니다. 저장 중 편집한 내용은 다음 저장 대상으로 남습니다.
- 초안은 현재 계정/브라우저의 IndexedDB에 저장됩니다. 서버 트래픽이 발생하지 않습니다. 다른 기기로 자동 동기화되지는 않으며 브라우저 데이터를 지우면 삭제됩니다.
- Enter는 새 문단, Shift+Enter는 같은 문단 안의 줄바꿈입니다. 코드 블록의 Enter는 줄바꿈입니다.
- 문단 사이 삽입 영역에 이미지/GIF를 끌어놓습니다. 이미지 설명도 입력할 수 있습니다.
- 본문에 YouTube 주소를 붙여넣거나 문단 사이 YouTube 버튼을 누르면 임베드·URL·멘션·썸네일 북마크를 선택합니다. 표시 제목은 직접 입력할 수 있습니다. 썸네일은 YouTube가 제공하는 이미지를 사용합니다.
- 다른 탭/기기에서 글을 먼저 수정했다면 덮어쓰기를 거부합니다. 현재 초안을 저장하고 최신 게시글을 다시 열어 반영하세요.
- ‘미리보기’와 공개된 글은 동일한 이미지·YouTube 렌더러를 사용합니다.
