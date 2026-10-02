# Trading Master 개선 화면 작업 규칙

- 최신 인수인계는 private 저장소
  https://github.com/irruyan/trading-master-engine/blob/main/PROJECT_STATE.md 에 있다.
  시작 시 GitHub 연결 또는 최신 checkout으로 읽고 작업 위치/브랜치/HEAD와 대조한다.
  읽지 못했다면 최신 상태 미확인이라고 알린다.
- 개선 화면은 이 저장소의 `dist/index.html`, `dist/app.css`다.
  오래된 ZIP의 루트 HTML이나 친구의 임시 사이트로 교체하지 않는다.
- GitHub 웹 미러와 Sites 소스 저장소는 별개다. 배포 시 `.openai/hosting.json`의
  기존 프로젝트를 확인하고 공식 Sites 열기/소스 동기화/저장/배포 절차를 따른다.
  사이트를 새로 만들거나 승인된 제품을 원본 UI로 대체하지 않는다.
- 기존 계좌·성과·원장 값과 보유/청산 거래 식별을 보존한다.
  `watchlist`와 `portfolio`는 같은 생성 시각·사이클이어야 한다.
- 작업 종료 시 private `PROJECT_STATE.md`에 검증 결과, 원격 커밋,
  실제 배포 여부와 미완료 사항을 갱신한다. 대화 이력만으로 인수인계하지 않는다.

프런트 검사:
`node --test tests/data-loader.test.js tests/performance-display.test.js tests/navigation.test.js tests/watchlist.test.js`.
