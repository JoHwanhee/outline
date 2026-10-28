// Fictional data used only by automated tests. Never loaded by the application.
import path from 'node:path';
import {seed as emptySeed} from '../scripts/seed.mjs';
export const resumeFixture=`## 프로필

백엔드 개발과 협업을 바탕으로 예시 서비스를 만드는 테스트용 개발자입니다.

## 주요 성과

- 예시 배포 시간 10분 → 2분
- 예시 검색 응답 500ms → 100ms
- 예시 반복 업무 주 2시간 감소

## 경력

### 예시테크 | 소프트웨어 엔지니어
2024.01 – 현재

- 테스트용 서비스를 개발했습니다.
- 동료와 개발 절차를 정리했습니다.

### 샘플스튜디오 | 개발자
2022.01 – 2023.12

- 테스트용 API를 개발했습니다.

### 데모시스템 | 개발자
2020.01 – 2021.12

- 테스트용 도구를 만들었습니다.

## 기술

Java, TypeScript, Node.js, Python, Docker, SQL
`;
export async function seed(dataRoot){const store=await emptySeed(dataRoot);await store.write(path.join(dataRoot,'common/profile.json'),{name:'테스트 사용자',email:'example@example.com',phone:'010-0000-0000',github:'https://github.com/example',blog:'https://example.com'});await store.write(store.commonPath('resume'),resumeFixture);await store.write(store.commonPath('career'),'## 테스트 프로젝트\n\n백엔드 개발과 협업 경험입니다.\n');await store.write(path.join(dataRoot,'setup.json'),{version:1,completed:true});await store.materializeAll();return store;}
