# 최신 트레이딩마스터 화면 소스 전달

이 ZIP은 친구의 원본 UI가 아니라 기존 Trading Master Beta의 소스 저장소에서 복구한 개선 화면입니다.

- 사이트 프로젝트: Trading Master Beta
- 확인한 사이트 최신 버전: 7
- 복구한 저장소 HEAD: 838b194ecd7913391a5456a4bc73ee13024408b8
- 실제 실행 진입점: dist/index.html
- 계좌 구분: 코스피 / 코스닥
- 내비게이션: 계좌 → 계좌 상세 → 종목 상세; 계좌 내 보유 / 청산 / 성과
- 과거 백테스트와 포워드 모의운용 성과 분리
- 검증: node tests/data-loader.test.js 통과

## 로컬 Codex 작업

1. 이 ZIP을 C:\dev\trading-master-web에 별도로 압축 해제한다. 기존 엔진 및 원본 UI 폴더는 덮어쓰지 않는다.
2. 화면 진입점은 dist/index.html이다. dist/legacy.html은 비교용 옛 화면이며 배포 기본 화면으로 쓰지 않는다.
3. node tests/data-loader.test.js를 실행한다.
4. python -m http.server 8780 --directory dist로 실행하고 http://localhost:8780을 확인한다.
5. dist/runtime-config.js의 snapshotUrl은 배치 JSON 주소, apiOrigin은 /api/v2/snapshot을 제공하는 서버 주소다. 실제 업로드된 개인 데이터 저장소와 엔진의 응답 구조를 확인한 뒤 연결한다. URL이나 저장소명을 추측하지 않는다.
6. 이 화면은 정적 배포 가능하다. 루트 도메인에 배포하는 방식과 GitHub Pages의 프로젝트 하위 경로 배포를 구분한다. 현재 fallback JSON 및 서비스 워커 경로에는 루트 절대경로가 있으므로 프로젝트 하위 경로에서는 그대로 작동한다고 가정하지 않는다.
7. .openai/hosting.json은 기존 Sites 메타데이터일 뿐이며 일반 배포에 Sites 플러그인은 필요 없다. 엔진 키나 .env는 ZIP에 포함되지 않는다.
8. 로컬 동작과 데이터 연결을 검증한 후 개인 GitHub 저장소와 무료 배포를 진행한다. 회사 계정/설정은 변경하지 않는다.

## 검증 범위

저장소 복구, 코드상 화면 구조, 데이터 로더 테스트를 확인했다. 집 컴퓨터의 엔진 연결 및 새 외부 호스팅 배포는 아직 검증하지 않았다. 이 ZIP을 받은 것만으로 운영 데이터 연결이 완료된 것은 아니다.
