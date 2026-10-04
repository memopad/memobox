# 코코포리아 주크박스 웹 청취 사이트

확장프로그램이 없는 친구에게 **GM이 보내는 링크**로 동일한 YouTube 곡을 듣게 하는 정적 웹사이트입니다. 기존 `ccfolia-handout` Firebase 프로젝트를 사용합니다.

## 배포하기 (GitHub Pages, 별도 서버 불필요)

1. 이 폴더의 `index.html`, `style.css`, `app.js`, `firebase-config.js`를 **새 GitHub 공개 저장소의 루트**에 업로드하세요. 웹페이지 자체가 공개됩니다. Firebase 연결 정보는 클라이언트에서 사용되는 공개 식별자입니다.
2. 해당 저장소에서 **Settings → Pages → Build and deployment → Deploy from a branch → main / (root)**를 설정하세요.
3. 생성된 HTTPS 주소(예: `https://계정.github.io/jukebox/`)를 확인하세요. 실제 사이트가 공개되기까지 수분이 걸릴 수 있습니다.
4. 코코포리아 주크박스에서 GM으로 로그인한 후 상단 **링크 아이콘**을 누르면, 최초 한 번 사이트 주소를 입력할 수 있습니다. 다음부터는 바로 링크가 복사됩니다. **Alt + 클릭**으로 사이트 주소를 변경할 수 있습니다.
5. 복사되는 `https://계정.github.io/jukebox/?room=코코포리아룸ID` 링크를 친구들에게 보내세요. 방문자는 닉네임을 입력하고 **입장하고 듣기**를 누릅니다. 브라우저의 자동재생 제한 시 **소리 재생 허용**을 한 번 더 누를 수 있습니다.

배포 경로에 따라 `?room=...` 앞의 실제 URL 경로가 달라질 수 있습니다. 링크 아이콘에는 **배포된 페이지의 주소**를 입력하세요. 예: `https://사용자명.github.io/저장소명/`.

## Firebase 연결과 데이터

`firebase-config.js`는 업로드한 **기존 주크박스 확장프로그램 Firebase 번들에서 확인한 공개 웹 설정값**을 포함합니다. 실제 프로젝트 ID는 `ccfolia-handout`입니다. 다른 프로젝트를 쓰게 되면 이 파일을 변경해야 합니다.

- **읽기:** `jukeboxRooms/{roomId}/playback/current`, `jukeboxRooms/{roomId}/playlists`, `jukeboxRooms/{roomId}/listeners`
- **쓰기:** `jukeboxRooms/{roomId}/listeners/{web-임시세션}`에 `{guest:true, playerId:'web:...', name:닉네임, listening:true, updatedAt:serverTimestamp()}`만 작성
- **절대로 건드리지 않음:** `handouts/{roomId}/players`, `jukeboxRooms/{roomId}/playback/current`, `jukeboxRooms/{roomId}/playlists` 쓰기

청취자 세션은 페이지에서 나갈 때 삭제를 시도합니다. 네트워크 종료 중 삭제가 실패해도 **95초간 갱신이 없는 청취자**는 목록에서 자동 제외됩니다. 다만 실제 문서 자동 삭제는 아니므로 필요하면 별도 정리 정책을 구축할 수 있습니다.

## 현재 주어진 Firestore 규칙

현재 사용 중인 규칙은 `jukeboxRooms/{roomId}`와 하위 `playback`, `playlists`, `listeners` 경로를 모두 `if true`로 허용하므로 **이 사이트 시험을 위한 추가 규칙은 필요 없습니다.**

⚠️ **보안 경고:** 이 규칙은 사이트의 '청취 전용 UI'와 달리 **모든 사용자에게 룸 주크박스 재생 및 목록 쓰기 권한**을 부여합니다. GM ID는 인증 토큰이 아니고 룸 URL도 보안 비밀번호가 아닙니다. 현재 결과물은 신뢰하는 소규모 참가자용 시험판이며, 공개 운영을 하려면 Firebase Authentication, 서버 검증 가능한 GM 권한과 Firestore 보안 규칙을 새로 설계해야 합니다. 서버가 인증하지 않은 사용자의 데이터 쓰기를 **UI에서만 막을 수는 없습니다.** 기존 시트 확장을 유지하면서 바로 모든 쓰기 규칙을 잠그면 기존 기능이 멈출 수 있으므로, 무작정 바꾸지 마세요.

## YouTube 제약

공식 YouTube IFrame Player를 화면에 표시합니다. 일부 영상은 임베드를 차단합니다. 브라우저는 소리 있는 자동재생을 차단할 수 있으므로 참가자의 최초 클릭이 필요할 수 있습니다. 재생 위치는 Firestore 타임스탬프를 기준으로 맞추되, 각 브라우저의 네트워크 버퍼링 차이로 완벽한 동시 샘플 재생은 보장하지 않습니다. 웹 청취자는 재생 제어권이 없으며, 원곡이 끝났을 때 다음 곡으로의 **공유 자동 전환은 GM 확장프로그램이 담당**합니다.

## 파일

- `index.html`: 참가자 입장과 웹 플레이어 구조
- `style.css`: 반응형 UI 스타일
- `app.js`: Firestore 청취와 YouTube 동기화, 임시 청취자 세션
- `firebase-config.js`: 기존 프로젝트 공개 웹 SDK 설정
