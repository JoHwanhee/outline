# Outline

**당신의 경험을, 다음 기회로.**

개인이 자기 컴퓨터에서 사용하는 오픈소스 경력 작업실입니다. 자료를 모으고, 공통 이력서를 다듬고, 채용공고에 맞춘 지원서와 자기소개 페이지로 연결합니다. 새 설치에는 다른 사람의 개인정보나 예시 경력이 들어 있지 않습니다.

## Docker로 시작하기

Docker와 Docker Compose를 설치한 뒤, 이 저장소 폴더에서 실행하세요.

```sh
cp .env.example .env
docker compose up -d --build
```

브라우저에서 **http://localhost:4317** 을 열고 첫 설정을 진행합니다.

1. 이름과 선택 연락처·목표 직무를 입력합니다.
2. 빈 문서로 시작하거나 TXT/Markdown/PDF/DOCX 이력서를 가져옵니다. 스캔 PDF는 본문을 붙여 넣습니다.
3. AI는 나중에 연결하거나, Codex/Claude SDK와 로그인/API 키를 선택합니다.
4. 설정을 확인하고 작업실을 시작합니다. 프로필·AI 설정은 이후에도 수정할 수 있습니다.

AI 없이도 문서 편집, PDF 출력, HTML 자기소개 페이지 생성을 사용할 수 있습니다. 모델 이용 권한과 사용료는 각 제공자 계정에 따릅니다.

### 데이터와 로그인은 어디에 저장되나요?

| 볼륨 | 컨테이너 경로 | 보관하는 내용 |
| --- | --- | --- |
| `outline_data` | `/app/data` | 프로필, 문서, 원문 파일, 변경 이력, 대화·평가 결과, API 키, HTML/PDF |
| `outline_sdk_home` | `/home/node` | Codex/Claude 로그인과 SDK 세션·설정 |

실제 볼륨 이름 앞에는 Compose 프로젝트 이름이 붙습니다. 컨테이너 재생성·이미지 업데이트·`docker compose down`으로 이 데이터가 지워지지 않습니다. **`docker compose down -v`는 볼륨까지 삭제하므로 데이터를 지울 때만 사용하세요.**

호스트에서 파일을 직접 보려면 [바인드 마운트와 백업 안내](docs/docker.md)를 참고하세요. 기본 구성은 비관리자 사용자 UID 1000으로 실행하고, 호스트의 홈이나 로그인 파일을 자동으로 마운트하지 않습니다.

### Docker에서 AI 로그인

호스트 PC의 Keychain 로그인은 컨테이너로 자동 전달되지 않습니다. 컨테이너에 별도로 로그인하면 SDK 홈 볼륨에 유지됩니다. 로그인은 사용자가 터미널과 브라우저에서 직접 진행합니다.

```sh
# Codex: 브라우저 콜백 포트가 필요 없는 기기 인증
docker compose exec outline npm run codex -- login --device-auth

# Claude: 출력되는 링크와 안내를 따라 로그인
docker compose exec outline npm run claude -- auth login
```

지원하는 계정·조직 정책은 제공자에 따라 달라집니다. API 키를 사용하려면 앱의 **AI 연결 · 사용량**에 입력하거나 `.env`에 해당 환경변수를 넣고 컨테이너를 재생성하세요. AI 설정에서 API 키 모드를 선택해야 키를 사용합니다.

### 업데이트

```sh
git pull
docker compose up -d --build
```

먼저 데이터를 백업하는 방법과 이전 로컬 작업실 이관 방법은 [docs/docker.md](docs/docker.md)에 있습니다.

## 주요 기능

- **자료 저장소**: 메모·파일·공개 링크를 수집하고 원문을 보관합니다.
- **공통 경력**: Markdown 이력서·경력기술서, 섹션 상속, 자동 저장과 버전 충돌 확인.
- **회사별 지원서**: 회사와 포지션·공고 링크/본문을 추가하고 문서를 맞춤 작성합니다.
- **문서 옆 AI 채팅**: 수정 중 미리보기, 검증 후 자동 반영, 수정 되돌리기.
- **채용 패널 평가**: 7개 독립 관점, 개선안과 재평가, 채팅에서 선택 반영·되돌리기.
- **대화별 SDK·모델**: Codex/Claude, 로그인/API 키, 토큰·SDK 제공 추정 비용 확인.
- **문서 출력**: 한글 PDF, Markdown, LaTeX와 글꼴 ZIP.
- **자기소개 웹페이지**: 공통 이력서 기반 미리보기, 연락처 선택, 독립 HTML 다운로드.

## 로컬 개발

Node.js 22와 Python 3.11+을 권장합니다.

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm run dev
```

브라우저에서 http://localhost:4317 을 열면 같은 온보딩이 시작됩니다. macOS에서는 `Start.command`로 실행할 수 있습니다.

| 환경변수 | 기본값 / 설명 |
| --- | --- |
| `OUTLINE_DATA_DIR` | 프로젝트의 `data/`; 기존 폴더를 지정하면 그대로 사용 |
| `PORT` | `4317` — 앱이 듣는 포트 |
| `HOST` | 로컬 실행 `127.0.0.1`; Docker `0.0.0.0` |
| `OUTLINE_ORIGINS` | 허용할 origin 목록. 쉼표로 구분; Compose가 외부 포트에 맞춰 설정 |
| `OUTLINE_PYTHON` | 기본 PDF 엔진의 Python. `.venv/bin/python`, `python3`도 검색 |
| `OUTLINE_PORT` | Compose의 호스트 포트; `PORT`와 별개 |
| `CODEX_HOME` / `CLAUDE_CONFIG_DIR` | SDK 자체 로그인·세션 위치 |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | API 키 인증 모드의 선택 입력 |

이전 로컬 버전의 `RESUME_DATA_DIR`, `RESUME_PYTHON`, `RESUME_NO_LISTEN`은 호환용으로 지원합니다. 기존 데이터에 이름이 설정돼 있으면 새 온보딩으로 덮어쓰지 않습니다.

## 검증과 기여

```sh
npm test
npm run check:release
bash scripts/docker-smoke.sh  # Docker 환경: 초기 설정 후 컨테이너 재생성과 데이터 유지 검증
npm run release:archive      # allowlist 기반 소스 ZIP, data와 인증 파일 제외
```

`npm run check:ui`는 Playwright Chromium이 준비된 개발 환경에서 화면 흐름을 확인합니다. 필요하면 `npx playwright install chromium`을 실행합니다. `npm run check:agent`는 실제 모델 사용량이 발생하는 선택 검증입니다. `OUTLINE_PROVIDER=claude`와 `OUTLINE_MODEL`로 제공자·모델을 지정할 수 있습니다.

상세 개발 안내는 [CONTRIBUTING.md](CONTRIBUTING.md), 데이터와 접근 경계는 [SECURITY.md](SECURITY.md)를 참고하세요. 배포 소스에는 개인 문서·API 키·SDK 로그인 정보를 포함하지 않습니다.

## 라이선스와 고지

앱 소스는 [MIT](LICENSE)입니다. 글꼴·템플릿·SDK 등은 각자의 라이선스를 유지합니다. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 확인하세요.

내장 hiring-panel 스킬은 Alex Chen (@nocodealex)의 원본과 크레딧을 유지합니다. 평가와 AI 제안은 모델의 의견이며 실제 채용 결과를 보장하지 않습니다. 사용량은 SDK가 제공한 값만 표시하고 추정 비용은 실제 청구액과 다를 수 있습니다.
