# 작업·빌드·설치·복구

## 검사와 빌드

PowerShell 7에서 `./scripts/check.ps1`을 실행합니다. 소스 해시와 스크립트 문법, 기존 도구와 설치 상태를 읽기 전용으로 확인합니다. 설치되지 않은 컴퓨터에서도 소스 검사가 가능합니다.

- `./scripts/build.ps1 -Plan`: 빌드 계획만 출력합니다.
- `./scripts/build.ps1 -TestOnly`: native rainbow 테스트를 실행합니다.
- `./scripts/build.ps1`: CLI와 migration manifest를 빌드합니다.
- `node --test scripts/install-native.test.mjs`: 임시 설치본으로 설치 도구의 회귀 검사를 실행합니다.

Windows 빌드는 기존 기본 Rust toolchain과 사용자 홈의 `.codex-hud-target` 캐시를 사용합니다. SQL 줄바꿈 정규화는 프로젝트 소스에만 적용하며 DB를 바꾸지 않습니다. 빌드 결과를 자동 설치하지 않습니다.

macOS에서 `cargo build -p codex-cli` 후 `scripts/build-migration-manifest.mjs`에 `codex/codex-rs/state`, 출력 JSON 경로, 실제 빌드 바이너리 경로를 전달합니다. `CARGO_TARGET_DIR`을 지정했다면 실제 바이너리 위치를 사용해야 합니다.

## 설치

기존 npm `@openai/codex`와 후보 바이너리가 모두 0.163.0이어야 합니다. `scripts/install-native.mjs`에 `--binary`, `--migration-manifest`를 지정하고 **`--apply` 없이 먼저** 검사합니다. npm 설치 위치가 기본값과 다르면 `--package-root`로 `@openai/codex` 디렉터리를 지정합니다.

설치 도구는 후보 바이너리 버전과 SHA256, 플랫폼·아키텍처 및 기존 DB migration checksum을 확인합니다. 기존 DB는 읽기 전용으로 열며, 불일치하면 중단합니다. Node의 `node:sqlite`를 지원하는 Node.js가 필요합니다.

`--apply`를 지정하면 사용자 홈의 `.local/share/codex-native-hud/0.163.0/bin`에 바이너리를 배치하고 npm launcher를 연결합니다. 보조 실행파일도 같은 버전의 npm 플랫폼 패키지에서 복사합니다. 특히 `codex-code-mode-host` 누락 시 명령 도구가 시작되지 않으므로 `codex` 파일만 별도로 복사하지 마세요.

공식 vendor 파일, 공용 config, auth와 DB는 수정하지 않습니다. 기존 Codex·Herdr 프로세스를 종료하지 않습니다. 설치 결과와 `backupRoot`는 관리 폴더의 `installation.json`에 기록합니다. Windows에서 실행 중인 이전 바이너리는 백업 폴더로 이동해 보존합니다.

macOS의 로컬 빌드는 환경에 따라 설치 후 관리 폴더의 바이너리에 ad-hoc 서명이 필요할 수 있습니다:

```sh
codesign --force --sign - "$HOME/.local/share/codex-native-hud/0.163.0/bin/codex"
```

서명 후 파일 해시가 바뀔 수 있으므로 빌드 후보 해시와 설치 후 해시를 구분합니다.

## 복구

`installation.json`의 `backupRoot/codex.js`를 `launcherPath`로 복사하면 해당 설치 직전 launcher로 돌아갑니다. 이미 HUD가 연결된 상태에서 재설치했다면 이전 백업의 launcher도 HUD를 가리킬 수 있으므로 내용을 확인하고 최초 연결 이전 백업을 선택합니다.

이 installer 밖에서 만든 standalone 경로·정션은 자동 복구하지 않습니다. 실제 대상을 확인해 별도로 복구해야 합니다. 실행 중 프로세스나 DB를 삭제하거나 강제 종료하지 마세요.

## 화면 확인

다크·라이트 터미널에서 새 세션의 첫 요청 전 화면, 기존 세션의 `resume`, 같은 폴더에 열린 여러 세션을 확인합니다. 컬러 변경은 실제 터미널 화면에서 확인해야 하며 ANSI 텍스트나 테스트 통과만으로 시각 검증을 대신하지 않습니다. 외부 터미널의 코드 블록 오버레이가 RGB 배경을 덮어쓰는지도 확인합니다.
