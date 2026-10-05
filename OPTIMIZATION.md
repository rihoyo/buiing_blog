# 성능·구조 정리와 Supabase 적용

## 적용 순서

프런트엔드는 기존 DB에서도 동작합니다. 아래 SQL을 적용하면 답글 개수와 분리된 통계 API가 활성화됩니다. 이번 작업에서 운영 Supabase에는 읽기 쿼리만 실행했습니다.

1. Supabase에서 프로젝트 `dkdiuungbqdnidhtusns`를 선택합니다.
2. **SQL Editor → New query**를 엽니다. 저장소의 `supabase/optimization.sql` 파일에서 **전체 내용**을 복사하여 붙여넣고 **Run**을 누릅니다. Save는 쿼리 보관일 뿐, DB 적용이 아닙니다. 기존 `community-editing.sql`까지 적용된 DB가 대상입니다.
3. 성공 후 **Edge Functions → publish-post → Code**에서 `supabase/functions/publish-post/index.ts` 전체 코드로 교체하고 **Deploy updates**를 누릅니다. 기존 **Verify JWT OFF** 설정을 유지합니다. 함수 자체의 로그인·관리자 검증은 유지됩니다.
4. 관리자 화면에서 **통계 새로고침**, 활동 로그 조회를 확인합니다. 방명록 답글 펼치기·수정·삭제, 글 게시·수정을 확인합니다.

새 토큰이나 Secret은 필요 없습니다. `guest-interactions`는 이번에 서식만 정리했으므로 재배포할 필요가 없습니다. SQL은 트랜잭션이며 재실행할 수 있습니다. 기존 본문과 비밀번호 해시는 변경하지 않습니다. 새 private 테이블에는 RLS와 접근 제한이 포함되어 있습니다. 실행 경고가 나오면 이 파일 전체인지 확인하고 실행합니다. 기존 테이블을 삭제하는 SQL은 없습니다.

적용 여부는 SQL Editor에서 다음 **조회**로 확인할 수 있습니다.

```sql
select version, applied_at from private.optimization_versions;
select column_name from information_schema.columns
where table_schema='public' and table_name='guest_entries' and column_name='reply_count';
select proname from pg_proc where pronamespace='public'::regnamespace
and proname in ('admin_community_activity','admin_community_stats','admin_activity_series');
```

첫 조회에는 `daily-metrics-v1`, 두 번째에는 `reply_count`, 마지막에는 함수 세 개가 나옵니다. 관리자 API 실행은 로그인한 사이트에서 확인합니다. SQL Editor 세션에는 일반적으로 사이트 로그인 사용자 정보가 없습니다.

## 무엇이 줄었는가

| 동작 | 기존 | 변경 |
|---|---|---|
| 댓글·방명록 첫 조회 | 원글과 숨겨진 답글까지 조회 | 원글 20개, 답글은 펼칠 때 50개씩 |
| 댓글 수정 후 갱신 | 목록 전체 재조회 | 수정한 행만 재조회 |
| 활동 로그 다음 페이지 | 통계·승인 목록도 다시 계산 | 로그 최대 50개만 조회(SQL 적용 후) |
| 본문 이미지 업로드 | 순차 처리 | 최대 3개 동시 처리, 같은 이미지 업로드 공유 |
| 게시 권한 확인 | 사용자·관리자 조회 순차 처리 | 두 조회 병렬 처리, 둘 다 검증 후 게시 |
| 사이트 설정 | 기능별 중복 요청 | 페이지 내 요청 공유, 실패 시 재시도 가능 |
| 편집기·관리자 코드 | 초기 번들 포함 | 해당 기능 사용 시 별도 모듈 로딩 |

초기 JS의 정적 의존성을 모두 합산한 gzip 크기는 로컬 빌드 기준 약 **163KB → 152KB**입니다. 이미지·폰트·HTML은 제외한 수치입니다. 압축된 산출물과 사람이 편집하는 원본 소스를 분리했습니다. 운영 DB는 점검 당시 약 12MB로 작았습니다. 이것은 요청 수와 빌드 크기 개선이며, 실제 운영 게시 시간을 몇 초 단축했다고 측정한 결과는 아닙니다. GitHub Pages 정적 재배포 시간은 별도로 남고, 기존 즉시 게시 경로는 유지됩니다.

## 통계와 향후 차트

- `admin_community_stats()`는 현재 개수와 오늘 활동을 반환합니다.
- `admin_community_activity(...)`는 필터·커서 기반 활동 로그를 반환합니다.
- `admin_activity_series(p_days)`는 1~366일의 한국 시간 기준 날짜별 활동량을 반환합니다. 활동 없는 날도 0으로 채웁니다.
- 새 활동은 기록 트랜잭션에서 일별 집계에도 반영됩니다. 원본 로그는 기존 90일 보존 정책을 유지하고, 일별 집계는 원본 정리 후에도 유지합니다. 최초 집계는 현재 남아 있는 로그만 사용하므로 이미 지워진 과거 활동은 복원되지 않습니다.
- 세 API는 관리자 인증이 필요합니다. 집계 테이블을 공개하거나 브라우저에 서비스 키를 넣지 않습니다.
- 현재는 차트용 API 준비까지입니다. 자동 갱신 차트나 Realtime 구독은 아직 추가하지 않았습니다. 다음 단계에서는 화면이 보일 때만 주기적으로 조회하는 차트부터 연결할 수 있습니다. 이를 위해 지금 Realtime 전체 공개를 켤 필요는 없습니다.

## 수정할 파일 찾기

| 파일 | 역할 |
|---|---|
| `app.js` | 공개 화면과 라우팅 |
| `community.js` | 로그인, 회원 게시판, 관리자 진입 |
| `assets/guest-community.js` | 댓글·방명록·답글과 부분 갱신 |
| `assets/admin-dashboard.js` | 승인·통계·로그 UI |
| `assets/admin-api.js` | 관리자 API와 구버전 호환 처리 |
| `blog-editor.js` | 게시글 편집·게시·이미지 업로드 |
| `assets/async-work.js` | 동시 작업 수 제한 |
| `assets/site-config.js` | 설정 요청 공유 |
| `supabase/optimization.sql` | 인덱스·답글 수·통계 집계·조회 함수 |

`npm run format`으로 원본 서식을 정리하고, `npm run format:check`로 확인합니다. `dist/`는 빌드 산출물이므로 직접 수정하지 않습니다. DB 구조를 이후 변경할 때에는 이미 적용한 SQL을 덮어 고치기보다 새 migration 파일을 추가해 순서를 기록합니다.
