# Docker 운영과 데이터 이관

## 볼륨 유지

기본 Compose 프로젝트에는 앱 데이터와 SDK 홈이라는 두 개의 이름 있는 볼륨이 있습니다. Compose 프로젝트 이름을 변경하면 다른 빈 볼륨을 사용하는 것이므로, 기존 설치를 업데이트할 때 같은 폴더/프로젝트 이름을 유지하세요.

```sh
docker compose ps
docker compose config
docker compose logs --tail=100 outline
```

프로세스 상태는 `http://localhost:4317/healthz`에서 확인합니다. 이 엔드포인트는 개인정보나 키를 반환하지 않습니다. `OUTLINE_PORT`를 바꾸면 주소의 포트도 바꾸세요.

## 호스트 폴더에 저장하기

```sh
mkdir -p outline-data
docker compose -f compose.yaml -f compose.bind.yaml up -d --build
```

`./outline-data`가 `/app/data`에 연결되고 SDK 홈은 기존 named volume을 사용합니다. 다른 경로는 `.env`의 `OUTLINE_DATA_PATH`로 지정합니다. Linux에서 컨테이너 UID 1000이 선택한 폴더에 쓸 수 있어야 합니다. 필요한 경우 자신이 관리하는 그 폴더만 소유권/권한을 조정하세요. 전체 홈을 마운트하거나 넓게 권한을 풀 필요는 없습니다.

예를 들어 UID 1000으로 사용하는 Linux 계정에서는 `mkdir -p outline-data` 후 바로 쓸 수 있습니다. 다른 UID의 호스트에서 권한 오류가 나면 관리자가 해당 전용 데이터 폴더의 소유권을 `1000:1000`으로 조정할 수 있습니다. macOS/Windows Docker Desktop의 공유 폴더 권한도 확인하세요.

## 백업과 복원

일관된 백업을 위해 앱을 멈춘 뒤, 별도 백업 폴더에 두 볼륨을 각각 내보냅니다. 아래 명령은 기존 볼륨을 지우지 않습니다.

```sh
mkdir -p backups
docker compose stop outline
docker compose run --rm --no-deps -v "$(pwd)/backups:/backup" --entrypoint sh outline -c 'tar -czf /backup/outline-data.tar.gz -C /app/data . && tar -czf /backup/outline-sdk-home.tar.gz -C /home/node .'
docker compose start outline
```

Linux의 bind-mount 권한 때문에 백업 파일 생성이 거부되면 백업 전용 폴더에 UID 1000의 쓰기 권한을 부여하세요. 백업에는 이력서·API 키·로그인이 포함될 수 있으므로 비공개로 보관하세요.

새 빈 설치에 복원할 때 먼저 `docker compose build`, `docker compose create`로 볼륨을 준비하고, 앱이 정지된 상태에서 실행합니다. **복원은 현재 데이터에 파일을 쓰므로 빈 대상이나 별도 백업이 있는 대상에만 실행하세요.**

```sh
docker compose run --rm --no-deps -v "$(pwd)/backups:/backup:ro" --entrypoint sh outline -c 'tar -xzf /backup/outline-data.tar.gz -C /app/data && tar -xzf /backup/outline-sdk-home.tar.gz -C /home/node'
docker compose up -d
```

다른 OS/아키텍처로 옮기면 SDK 실행 파일은 이미지 안에서 다시 설치되지만, 로그인은 제공자 정책에 따라 다시 필요할 수 있습니다. 호스트 macOS Keychain 로그인은 복사하지 말고 컨테이너에서 새로 로그인하세요.

## 기존 로컬 작업실 이관

기존 서버를 먼저 중지하고 기존 `data/`를 별도로 백업합니다. 바인드 마운트 방식을 쓰려면 그 폴더를 복사해 `outline-data/`로 놓고 위의 두 Compose 파일로 실행하세요. 데이터는 source ZIP이나 Docker 이미지에 넣지 않습니다. 기존 이름·문서·회사·이력·자료·소개 페이지를 유지하며, 이름이 설정된 작업실은 새 온보딩을 자동으로 건너뜁니다.

폰트 심볼릭 링크는 앱 시작 시 현재 배포 위치에 맞춰 복원합니다. 실행 중인 원본과 복사본을 동시에 같은 폴더에 연결하지 마세요. 데이터베이스 서버 대신 파일 저장소를 사용하는 단일 사용자 앱입니다.

## 포트 충돌

다른 앱이 4317 포트를 사용하면 `.env`에서 `OUTLINE_PORT=4318`로 바꾸고 컨테이너를 재생성하세요. Compose가 허용 origin도 함께 바꿉니다. 외부 접속을 의도하지 않는다면 `127.0.0.1:` 포트 바인딩을 유지하세요.

## AI 실행

Codex/Claude SDK는 이미지 안의 Linux용 실행 파일을 사용합니다. 호스트의 SDK 바이너리나 `node_modules`를 마운트하지 마세요. 도구 실행은 앱이 제한하며 추가적인 privileged 모드나 호스트 Docker 소켓이 필요하도록 구성하지 않았습니다. 관리 환경에서 SDK 샌드박스나 인증 실행이 제한되면 오류를 확인하고 API 키 방식 또는 지원되는 실행 환경을 사용하세요. 모델 접근과 실제 실행 가능 여부는 사용자의 계정·네트워크·호스트 정책에 따릅니다.

### Codex 로그인 오류(401)

호스트에서 Codex가 동작해도 컨테이너의 SDK 홈은 별도 볼륨입니다. `Missing bearer or basic authentication in header`가 표시되면 먼저 Outline 폴더에서 컨테이너의 로그인을 확인하세요.

```sh
docker compose exec outline npm run codex -- login status
docker compose exec outline npm run codex -- login --device-auth
```

기기 인증 안내에 따라 브라우저에서 로그인한 뒤 실패했던 요청을 다시 보내세요. 로그인은 `outline_sdk_home` 볼륨에 저장되므로 컨테이너를 재생성해도 유지됩니다. 앱은 로그인 정보가 없는 상태에서 Codex 요청을 보내지 않습니다. 로그인 정보가 감지돼도 토큰 만료나 접근 권한까지 보장하지는 않습니다.

이미 로컬에 `~/.codex/auth.json`이 있다면 [OpenAI 공식 인증 안내](https://learn.chatgpt.com/docs/auth#fallback-authenticate-locally-and-copy-your-auth-cache)에 따라 해당 파일만 컨테이너로 이전할 수도 있습니다. 아래 명령은 컨테이너의 기존 Codex 인증을 로컬 인증으로 교체하므로 같은 계정으로 사용할 때 실행하세요. 호스트에서 `CODEX_HOME`을 변경했다면 입력 파일 경로도 맞춰주세요.

```sh
docker compose exec -T outline sh -c 'umask 077; mkdir -p "$CODEX_HOME"; cat > "$CODEX_HOME/auth.json"; chmod 600 "$CODEX_HOME/auth.json"' < ~/.codex/auth.json
docker compose exec outline npm run codex -- login status
```

Keychain에만 인증이 있고 파일이 없다면 기기 인증을 사용하세요. 인증 파일은 토큰을 포함하므로 저장소나 Docker 이미지에 넣지 않습니다. API 키를 사용하려면 앱의 **AI 연결 · 사용량**에서 API 키 방식을 선택하고 키를 입력하세요.
