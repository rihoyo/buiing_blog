# 커뮤니티 보호와 WAF

GitHub Pages가 이 앱의 OWASP Top 10 대응을 완료해 주는 것은 아닙니다. OWASP Top 10은 웹 앱의 주요 위험 범주이며, WAF 규칙 10개를 적용하면 끝나는 목록이 아닙니다. WAF는 HTTP 요청의 공격 패턴·봇·과도한 요청을 줄이는 추가 계층입니다. 로그인·소유권·관리자 권한·DB 접근 제어 같은 앱의 검증을 대신할 수 없습니다.

## 현재 코드에서 검증하는 부분

- Supabase Auth로 로그인 토큰을 검증하고 DB의 관리자 기록으로 운영자 권한을 확인합니다. 브라우저의 관리자 표시를 신뢰하지 않습니다.
- PostgreSQL RLS와 서버 RPC에서 소유권·차단·삭제·관리자 작업을 검사합니다.
- 방문자 글/댓글은 계정별 작성 간격과 확인된 이메일, 길이 제한, 금칙어를 검사합니다. 이는 전체 IP/봇 요청 제한을 대신하지 않습니다.
- 글 렌더링에서 문자열을 이스케이프하며, 마크다운의 raw HTML 실행을 끕니다. 스크립트 URL과 잘못된 링크 형식을 거부합니다. 일반 링크 iframe은 sandbox로 격리합니다.
- 링크 북마크를 만들기 위해 서버가 임의 URL을 가져오지 않습니다. 링크 서버 요청을 통한 SSRF 기능을 추가하지 않습니다. 사이트 이름을 기본값으로 사용하며 작성자가 제목·설명·이미지 URL을 지정할 수 있습니다.
- 게시글 파일 경로·블록·이미지 주소·카테고리를 서버에서 검증하고, 오래된 수정본의 덮어쓰기를 거부합니다.
- GitHub 토큰은 Supabase Secret에 저장하며 브라우저에 제공하지 않습니다.

이 설명은 코드의 방어와 테스트 범위입니다. 운영 중인 GitHub/Supabase 프로젝트에 WAF가 켜져 있다는 증거나 외부 침투 테스트를 완료했다는 뜻은 아닙니다. 모든 OWASP 위험에 대한 보증도 아닙니다.

## WAF를 추가할 때

직접 WAF를 만드는 대신 요구에 맞는 관리형 WAF를 검토하세요. 예를 들어 Cloudflare의 관리형 규칙·봇/요청 제한은 사용 플랜별 제공 범위를 확인해야 합니다.

현재 방문자 글/댓글 API는 브라우저에서 `*.supabase.co`로 직접 연결됩니다. 블로그의 GitHub Pages 주소 또는 별도 프런트 도메인만 WAF로 보호해도 Supabase API 호출은 그 WAF를 지나지 않습니다. API까지 보호하려면 API용 게이트웨이/프록시를 앞에 두고, 원래 API에 대한 직접 쓰기 요청도 우회할 수 없도록 인증·권한 경로를 설계해야 합니다. DNS나 브라우저 URL만 바꾸는 것으로는 충분하지 않습니다. 이 작업은 아직 적용하지 않았습니다.

WAF 설치와 함께 회원별/IP별 요청 제한·가입/쓰기 봇 대응·오류/감사 로그와 알림·키 관리·백업 복원·의존성 업데이트를 운영해야 합니다. 서버 권한 검사는 WAF를 추가한 뒤에도 유지해야 합니다.

참고: [OWASP Top 10](https://owasp.org/www-project-top-ten/), [OWASP WAF 안내](https://owasp.org/www-community/Web_Application_Firewall), [GitHub Pages HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## Private blog content

Private posts use `owner_posts` with authenticated-only table grants and RLS requiring both `owner_id = auth.uid()` and `private.is_admin()`. Compare-and-set revision saves prevent stale overwrites. Private images use a separate non-public bucket with owner path policies and short-lived signed URLs. The private save client never invokes the GitHub publisher or public snapshot RPC; the publisher rejects posts explicitly marked private. The build fails if a private record is found under `posts/`. Private routes contain only an authentication shell and are excluded from indexing. Auth changes clear sensitive DOM before fetching a new identity.

The private storage path protects current private records. It cannot recall copies previously committed to a public repository. Public-to-private conversion uses a transactional private copy and a content-free public withdrawal marker, followed by a GitHub content-free tombstone and Pages redeployment. Failure to remove the GitHub current source is explicitly flagged with a retry action. Public snapshots reject attempts to restore withdrawn content. Public Git history/caches cannot be recalled by a checkbox. External media requires its own origin access control. Signed media URLs are bearer URLs valid for five minutes; their holder can use them until expiry. Supabase project operators and database backups remain within the infrastructure trust boundary. Local draft storage is scoped to the user account but is not encrypted against people who control the same browser profile/device.

## Anonymous comments and guestbook

`guest_entries` exposes only display fields under SELECT-only grants/RLS; passwords, salts, network HMACs and votes are separate in `private`. Guest mutation RPCs are executable only by `service_role`. The `guest-interactions` Edge Function validates size/types/context, accepts same-origin JSON, applies a transactional global/per-network budget before password hashing, and uses unique per-record random salts with PBKDF2-SHA256 210,000 iterations. Plaintext passwords never reach SQL. Deletion comparisons are constant-time in the function and rechecked against the private hash by SQL. Administrator deletion/ban/unban requires Auth and `is_admin`, regardless of browser flags.

All guest text is escaped as plain text; there is no HTML/Markdown/eval/shell execution in this path. SQL uses typed RPC parameters and fixed statements with a restricted search_path. Replies are bound to a live root within the same context. Votes have a unique per-entry network HMAC, and limits commit independently of failed writes/deletion attempts. RLS hides guest content belonging to withdrawn/private posts or deleted member threads. Network hashes depend on the service secret, which never goes to clients. IP-based identity can group shared-network users, and infrastructure headers are not a guarantee against spoofing; site-wide budgets remain a backstop. Distributed bot/traffic defense beyond these application controls requires an upstream service. See GUEST-COMMUNITY-SETUP.md for installation and limits.

커뮤니티 승인·수정·활동 로그는 `community-upgrade.sql`에서 승인 전 공개 조회 및 댓글 등록을 제한하고, 관리자만 통계·로그를 조회하도록 검사합니다. 비회원 수정은 해시 검증 및 요청 제한을 적용합니다. 빈 비밀번호는 사용자가 선택할 수 있으며 누구나 빈 값으로 수정·삭제할 수 있음을 화면에서 알립니다. 활동 로그는 원본 IP·비밀번호·본문을 저장하지 않고 90일 보관합니다.
