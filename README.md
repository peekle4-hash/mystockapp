# 주식 매매기록 · 수익률 대시보드

## 핵심 기능
- 매수/매도 기록(무제한 기업)
- 실현손익(누적) + 기준일 평가손익
- ISA/일반 분리 + 전체 합산
- 날짜별 그룹 접기/펼치기 + 날짜 헤더 합계(매수/매도/실현손익)
- 기업별 보유현황(보유수량/평균단가/원가/평가손익/실현손익/총손익/수익률)
- CSV 내보내기/가져오기
- LocalStorage 저장

## 계산 방식(중요)
- 실현손익은 **이동평균(평균단가)** 기준으로 계산
- 보유수량이 0보다 작아지는(공매도) 경우는 지원하지 않음
- 평가손익은 **기준 날짜의 종가(평가가)** 를 입력해야 계산됨

## GitHub Pages
Settings → Pages → Deploy from a branch → main / (root)


## Supabase(원본 DB) + 로그인만 하면 끝(추천)
이 버전은 **Supabase를 원본 DB**로 사용하고, 로그인하면 어떤 기기에서도 자동으로 내 데이터가 불러와지도록 구성할 수 있어요.

### 1) 코드에 Supabase URL/Anon Key 고정
`auth.js` 상단의 아래 값을 본인 프로젝트 값으로 교체하세요.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

> Anon Key는 공개 키(프론트 포함 가능)지만, **RLS 정책**이 반드시 필요합니다.

### 2) DB 테이블 + RLS
Supabase SQL Editor에서 `stock_data` 테이블을 만들고 RLS 정책을 적용하세요(가이드 참고).

### 3) Auth 설정
Supabase Dashboard → Authentication에서 Email, Google 로그인 설정 및 Redirect URL에 GitHub Pages 주소를 등록하세요.


## 구글 스프레드시트(클라우드) 연동
이 버전은 **PC/모바일/다른 브라우저**에서도 동일 데이터를 쓰도록, Apps Script + 구글시트를 DB처럼 쓸 수 있어요.

### 1) Apps Script 만들기
1. 구글 드라이브 → 새로 만들기 → **Google Apps Script**
2. `apps_script.gs` 내용을 **Code.gs**에 붙여넣기
3. 코드 맨 위 `TOKEN = "CHANGE_ME"` 를 원하는 값으로 변경
4. **배포 → 새 배포 → 웹 앱**
   - 실행 사용자: **나**
   - 접근 권한: **모든 사용자**(또는 링크가 있는 모든 사용자)
5. 배포 후 나오는 URL 중 **/exec** 주소를 복사

### 2) 사이트에 붙이기
사이트 탭 **구글시트 연동**에서
- Apps Script 배포 URL(/exec)
- 보안 토큰(위 TOKEN과 동일)

입력 후 **클라우드에 저장(업로드)** / **클라우드에서 불러오기** 버튼을 누르면 됩니다.

> 팁: “변경 시 자동 업로드”를 켜두면, 입력할 때마다 자동으로 저장돼요.
