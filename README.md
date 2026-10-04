# 주크박스 웹 청취 사이트

확장프로그램 주크박스 탭과 같은 단색·2열 레이아웃의 웹 청취 전용 페이지입니다. 모바일에서는 1열로 표시됩니다.

## 설치

1. `index.html`, `style.css`, `app.js`, `firebase-config.js`를 GitHub 저장소의 루트에 업로드하고 기존 파일을 교체합니다.
2. GitHub → Settings → Pages → Deploy from a branch → `main` / `(root)`로 배포합니다.
3. 초대 URL은 `https://사용자명.github.io/저장소명/?room=코코포리아룸ID` 형식입니다. 이미 배포된 사이트라면 파일 교체 후 새로고침합니다.
4. 방문자는 닉네임을 입력해 입장합니다. 자동재생이 막힌 경우 음표 아이콘을 눌러 재생을 허용합니다.

## 동작

- Firestore의 `jukeboxRooms/{roomId}/playback/current`, `playlists`, `listeners`를 실시간 구독합니다.
- 플레이리스트 탭은 보기 전용입니다. 탭을 선택해 곡 목록을 확인할 수 있습니다.
- 왼쪽은 YouTube 영상과 현재 곡, 개인 볼륨입니다. 오른쪽은 플레이리스트와 청취자 목록입니다.
- 청취자 닉네임은 `jukeboxRooms/{roomId}/listeners/{sessionId}`에만 등록합니다. 실제 `handouts/{roomId}/players`에는 등록되지 않습니다.
- 연결된 사이트 참가자가 웹 UI로 재생 상태·플레이리스트를 수정하지는 않습니다.

## 보안

현재 제공된 Firestore 규칙은 `jukeboxRooms`의 쓰기를 누구에게나 허용합니다. 웹 화면이 청취 전용이어도 서버에서 재생 상태 및 목록 변경을 차단하지 못합니다. 외부 공개 전 Firebase 인증 및 접근 규칙을 별도로 구성해야 합니다. 기존 시트 확장에 대한 접근 규칙은 무작정 변경하지 마세요.

## 파일

- `index.html`: 청취 UI
- `style.css`: 단색·반응형 레이아웃
- `app.js`: YouTube 동기화 및 Firestore 구독
- `firebase-config.js`: Firebase Web SDK 연결 설정
