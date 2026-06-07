# Unitree Physical AI Simulation by Machbase Neo

Humanoid Everyday 데이터를 Machbase Neo에 저장하고, 브라우저에서 휴머노이드 로봇의 3D 동작, 관절/IMU/손압력/오도메트리 센서 값, 주변 공간 포인트를 재생하는 데모입니다.

데모 목적은 Physical AI 센서 타임라인을 Machbase Neo에서 빠르게 저장/조회하고, 웹에서 시간축을 자유롭게 이동하며 로봇 동작과 센서 변화를 확인하는 것입니다.

## 데이터셋

사용 데이터셋:

```text
Humanoid Everyday
https://github.com/physical-superintelligence-lab/Humanoid-Everyday
```

Humanoid Everyday는 Unitree G1/H1 실제 로봇의 작업 수행 데이터를 포함합니다. 주요 센서는 관절 상태, IMU, 오도메트리, 손 센서/action, RGB, depth, LiDAR입니다. 전체 데이터셋은 매우 크므로 이 데모는 `data/catalog/humanoid-category-tasks.json`에 정의된 대표 task 35개를 사용하고, 각 task의 첫 번째 episode 1개만 Machbase Neo에 적재합니다.

## 실행 환경

이 문서는 명령 실행 위치를 분리해서 표기합니다.

| 표기 | 의미 | 사용하는 명령 |
|---|---|---|
| Linux shell | OS 터미널 | `git`, `unzip`, `curl`, `ss`, 환경변수 설정 |
| JSH shell/runtime | Machbase Neo JSH 내부 shell 또는 `machbase-neo jsh` | `/work/scripts/*.js`, `/work/app/server.js` |

중요:

- JavaScript 코드는 Machbase Neo JSH에서 실행합니다.
- JSH shell은 Linux shell이 아니므로 `export`, `unzip`, redirection 같은 OS shell 명령을 직접 실행하지 않습니다.
- 이 package는 Machbase Neo 설치 디렉토리의 `public/neo-humanoid-demo` 아래에 있고, JSH에서는 package root가 `/work`로 보인다고 가정합니다.
- Linux shell에서 한 번씩 검증 실행할 때는 `machbase-neo jsh -v /work="$(pwd)" ...`를 사용합니다. 이 방식도 Node.js가 아니라 Machbase Neo JSH 런타임입니다.
- Neo HTTP shell 클라이언트로 JSH에 접속할 때는 HTTP 포트 `5654`를 사용합니다. DB 접속 포트 `5656`은 `machcli`가 쓰는 native DB 포트입니다.

기본 DB 접속값:

```text
host: 127.0.0.1
port: 5656
user: sys
password: manager
HTTP: 5654
```

다른 접속값을 써야 하면 Machbase Neo/JSH를 시작하기 전에 Linux shell에서 설정합니다.

```sh
export PHY_DB_HOST=127.0.0.1
export PHY_DB_PORT=5656
export PHY_DB_USER=sys
export PHY_DB_PASSWORD=manager
```

JSH를 Linux shell에서 한 번 실행하는 예:

```sh
export NEO_HOME=<NEO_HOME>
cd <NEO_HOME>/public/neo-humanoid-demo
"$NEO_HOME/machbase-neo" jsh -v /work="$(pwd)" \
  /work/scripts/check-data.js --data-root data/raw/humanoid-everyday
```

JSH shell에 접속해서 여러 명령을 실행하는 예:

```sh
export NEO_HOME=<NEO_HOME>
cd <NEO_HOME>/public/neo-humanoid-demo
"$NEO_HOME/machbase-neo" shell \
  -server 127.0.0.1:5654 \
  -user sys \
  -password manager \
  -v /work="$(pwd)"
```

JSH prompt 안에서는 `/work` 기준으로 실행합니다. shell 클라이언트 종류에 따라 `cd`가 지원되지 않을 수 있으므로, 서버처럼 하위 디렉토리의 스크립트는 `/work/app/server.js`처럼 절대 경로로 실행하면 안전합니다.

## 전체 흐름

1. Linux shell에서 `<NEO_HOME>` 아래에 repository를 준비합니다.
2. JSH shell에서 Google Sheet 기반 catalog를 생성합니다.
3. Linux shell에서 대표 task ZIP을 다운로드하고 첫 번째 episode만 압축 해제합니다.
4. JSH shell에서 데이터 구조를 확인합니다.
5. JSH shell에서 스키마 생성과 ingest를 실행합니다.
6. JSH shell에서 데모 서버를 실행하고 브라우저로 접속합니다.

## 1. 프로젝트 준비

Linux shell:

```sh
cd <NEO_HOME>/public
git clone <repository-url> neo-humanoid-demo
cd neo-humanoid-demo
git status
```

JSH shell에서 보이는 경로:

```text
/work
```

주요 디렉토리:

```text
app/             JSH HTTP server
cgi-bin/         Machbase package CGI entrypoints
lib/             DB/API/Humanoid Everyday helper code
scripts/         download, schema, check, ingest scripts
public/          browser frontend
data/            local dataset directory
```

## 2. 데이터 다운로드

대표 task catalog는 Humanoid Everyday Google Sheet에서 category별 첫 5개씩 뽑아 만듭니다. 현재 catalog는 7개 category x 5개 task = 35개 task입니다.

JSH shell:

```text
/work > ./scripts/build-catalog-from-sheet.js --per-category 5 --out data/catalog/humanoid-category-tasks.json
```

현재 category 분포:

```text
articulate_object        5
basic_manipulation      5
deformable_object       5
high_precision          5
human_robot_interaction 5
loco_manipulation       5
tool_use                5
```

Linux shell에서 catalog의 ZIP을 다운로드하고 각 ZIP의 첫 번째 episode만 추출합니다. 이 명령은 기존 archive가 있으면 재사용하고, 새로 받은 archive는 추출 후 기본적으로 삭제합니다.

먼저 첫 task 1개로 다운로드와 압축 해제를 검증합니다. 2026-06-07 로컬 검증에서 첫 archive(`press_the_stapler_g1`)는 약 2.4GB를 다운로드했고, 첫 episode 추출 후 로컬 데이터는 약 111MB였습니다.

```sh
cd <NEO_HOME>/public/neo-humanoid-demo
KEEP_NEW_ARCHIVES=0 LIMIT=1 scripts/prepare-catalog-episodes.sh \
  data/catalog/humanoid-category-tasks.json \
  data/raw/humanoid-everyday
```

첫 task가 정상 준비되면 전체 catalog를 처리합니다. 전체 35개 task도 각 task ZIP 전체를 한 번씩 내려받아 첫 episode만 추출하므로 네트워크 시간과 임시 디스크 여유가 필요합니다. 2026-06-07 로컬 full 검증에서는 `KEEP_NEW_ARCHIVES=0` 기준으로 최종 raw 데이터가 약 12GB였고, 다운로드 완료 후 archive 잔여 파일은 0개였습니다.

```sh
cd <NEO_HOME>/public/neo-humanoid-demo
KEEP_NEW_ARCHIVES=0 scripts/prepare-catalog-episodes.sh \
  data/catalog/humanoid-category-tasks.json \
  data/raw/humanoid-everyday
```

유용한 옵션:

```text
KEEP_NEW_ARCHIVES=1  새로 받은 ZIP을 추출 후에도 보관
OVERWRITE=1          이미 추출된 episode를 다시 다운로드/추출
LIMIT=1              START_AT부터 지정 개수만 처리
START_AT=10          catalog index 10부터 시작
```

## 3. OpenHE 모션 데이터 추가

선택 데이터셋:

```text
OpenHE Unitree G1 Retargeted Motion Dataset
https://huggingface.co/datasets/openhe/g1-retargeted-motions
```

OpenHE 데이터는 Unitree G1용 30 FPS retargeted motion `.pkl` 파일입니다. 원본에는 LiDAR/RGB/depth가 없고, root pose, quaternion, 23 DOF joint, foot contact가 들어 있습니다. 이 데모에서는 Linux shell에서 `.pkl`을 내려받아 기존 `data.json` episode 구조로 변환한 뒤, JSH ingest로 timeline에 append합니다.

Linux shell:

```sh
cd <NEO_HOME>/public/neo-humanoid-demo
scripts/prepare-openhe-motion.sh lafan1_retargeted/walk1_subject1.pkl
```

기본 출력:

```text
data/raw/openhe/g1-retargeted-motions/lafan1_retargeted/walk1_subject1.pkl
data/raw/openhe-converted/openhe_walk1_subject1/episode_0/data.json
```

스크립트는 `/tmp/neo-openhe-venv`에 Python venv를 만들고 `numpy`, `joblib`을 설치해 pickle을 변환합니다. task prefix는 기본값 `openhe`이며, 필요하면 `TASK_PREFIX=<prefix>`로 바꿀 수 있습니다.

JSH shell에서 기존 sequence 뒤에 이어 붙입니다:

```text
/work > ./scripts/ingest.js \
  --data-root data/raw/openhe-converted \
  --dataset humanoid-everyday \
  --sequence humanoid-everyday-10m \
  --minutes 0 \
  --append \
  --flush-every 500 \
  --point-frame-stride 999999
```

주의: `--append`는 현재 sequence의 마지막 `frame_id/time` 뒤에 새 frame을 이어 붙입니다. 같은 변환 데이터를 반복 실행하면 같은 motion이 다시 append되므로, 재구성하려면 `./scripts/reset-schema.js` 후 기본 Humanoid Everyday ingest부터 다시 실행합니다.

이번 OpenHE 로컬 추가 검증 결과:

```text
source: openhe/g1-retargeted-motions lafan1_retargeted/walk1_subject1.pkl
task: openhe_walk1_subject1
frames: 7840
durationMinutes: 4.36
pointFrames: 0
sequence frameCount: 23645
episodeCount: 36
frame range: 15805..23644
```

OpenHE motion은 UI의 `Motion` select 첫 번째 항목에 `openhe_motion / openhe_walk1_subject1`로 표시됩니다. OpenHE `walk1`은 직선 보행이 아니라 루프/곡선 보행에 가까우므로, 브라우저 시각화는 episode 시작점에서 전체 끝점까지의 벡터가 아니라 시작 후 약 240 frame 지점까지의 초반 이동 벡터를 전진축으로 사용합니다. LiDAR point는 원본에 없으므로 센서 패널에서 `0 points`로 표시되는 것이 정상입니다.

## 4. 압축 해제 결과

전체 ZIP을 모두 보관하거나 풀면 매우 큰 공간이 필요합니다. 위 준비 스크립트는 각 대표 task에서 `data.json`이 있는 첫 번째 episode prefix만 찾아 표준 위치로 옮깁니다.

데모가 기대하는 episode 구조:

```text
data/raw/humanoid-everyday/<task>/episode_0/data.json
data/raw/humanoid-everyday/<task>/episode_0/color/*.jpg 또는 *.png
data/raw/humanoid-everyday/<task>/episode_0/depth/*
data/raw/humanoid-everyday/<task>/episode_0/lidar/*.pcd
```

`data.json`은 배열이거나 `data`, `steps`, `frames`, `episode` 중 하나의 배열 필드를 포함할 수 있습니다. 각 step에서 가능한 센서 필드를 읽고, 파일 경로가 명시되지 않은 RGB/depth/LiDAR는 `color/`, `depth/`, `lidar/` 디렉토리의 정렬 순서를 frame index에 맞춰 사용합니다.

## 5. 데이터 확인

JSH shell:

```text
/work > ./scripts/check-data.js --data-root data/raw/humanoid-everyday
```

확인할 항목:

```text
episodes              발견한 episode 수
steps                 전체 step 수
durationMinutes       30Hz 기준 또는 data.json time 기준 누적 길이
media.lidar           PCD LiDAR frame 수
media.rgb             RGB frame 수
media.depth           depth frame 수
```

첫 task smoke 검증 결과:

```text
episodes: 1
steps: 445
durationMinutes: 0.25
media.lidar: 405
media.rgb: 445
media.depth: 445
```

전체 35개 task 준비를 끝내면 `episodes`가 35개 이상이어야 합니다. 기존에 다른 task를 풀어 둔 경우 `check-data.js`의 episode 수는 더 크게 보일 수 있지만, 아래 ingest 명령은 `--catalog-only`로 catalog task만 적재합니다.

2026-06-07 전체 catalog 검증 결과:

```text
episodes: 35
steps: 15805
durationMinutes: 8.76
media.lidar: 14179
media.rgb: 15805
media.depth: 15805
```

## 6. 스키마 생성

JSH shell:

```text
/work > ./scripts/schema.js
```

생성 테이블:

```text
PHY_TIMELINE
PHY_POINT_FRAME
PHY_EPISODE_INDEX
```

주요 저장 관계:

| 원본 | Machbase 저장 |
|---|---|
| `data.json` step | `PHY_TIMELINE.value` JSON |
| step time 또는 30Hz frame time | `PHY_TIMELINE.time`, `PHY_POINT_FRAME.time` |
| `lidar/*.pcd` | `PHY_POINT_FRAME.value` binary |
| RGB/depth 파일 | `PHY_TIMELINE.value.media` 상대 경로 |
| episode 요약 | `PHY_EPISODE_INDEX` |

스키마만 출력:

```text
/work > ./scripts/schema.js --print
```

초기화가 필요할 때:

```text
/work > ./scripts/reset-schema.js
```

## 7. 데이터 적재

대표 catalog만 적재합니다. 각 task에서 첫 번째 episode 1개만 사용하고, 로봇 timeline은 모든 프레임을 저장하되 LiDAR point cloud는 10프레임마다 저장합니다.

```text
/work > ./scripts/reset-schema.js
/work > ./scripts/ingest.js \
  --data-root data/raw/humanoid-everyday \
  --catalog data/catalog/humanoid-category-tasks.json \
  --catalog-only \
  --episode-limit-per-task 1 \
  --minutes 0 \
  --flush-every 200 \
  --point-stride 4 \
  --point-frame-stride 10
```

옵션 의미:

```text
--catalog-only             catalog에 정의된 대표 task만 적재
--episode-limit-per-task 1 task별 첫 번째 episode 1개만 적재
--minutes 0                시간 제한 없이 위 조건을 만족하는 전체 episode 적재
--point-stride 4           PCD point를 4개마다 1개 저장
--point-frame-stride 10    LiDAR point frame을 10프레임마다 저장
```

첫 task smoke 적재 검증 결과:

```json
{
  "ok": true,
  "dataset": "humanoid-everyday",
  "sequence": "humanoid-everyday-10m",
  "sourceEpisodes": 1,
  "frames": 445,
  "pointFrames": 39,
  "tasks": 1,
  "episodeLimitPerTask": 1,
  "pointStride": 4,
  "pointFrameStride": 10,
  "durationMs": 14833
}
```

2026-06-07 전체 catalog 적재 검증 결과:

```json
{
  "ok": true,
  "dataset": "humanoid-everyday",
  "sequence": "humanoid-everyday-10m",
  "sourceEpisodes": 35,
  "frames": 15805,
  "pointFrames": 1428,
  "tasks": 35,
  "episodeLimitPerTask": 1,
  "pointStride": 4,
  "pointFrameStride": 10,
  "durationMs": 526833
}
```

`sourceEpisodes`는 raw 디렉토리에서 발견한 전체 episode 수입니다. 전체 catalog 준비 후 기본 Humanoid Everyday ingest를 실행하면 API와 UI에는 `--catalog-only`로 적재된 35개 episode가 표시됩니다. OpenHE append까지 실행하면 API와 UI에는 36개 episode가 표시됩니다.

기존 timeline을 유지한 채 episode index만 다시 만들 때:

```text
/work > ./scripts/rebuild-episode-index.js \
  --dataset humanoid-everyday \
  --sequence humanoid-everyday-10m
```

`/api/episodes`는 초기 화면에서 이 index table을 우선 사용합니다. index가 없으면 기존처럼 `PHY_TIMELINE.value` 전체 JSON을 scan해서 episode 목록을 만들기 때문에 초기 `Initializing` 시간이 길어질 수 있습니다. 이번 로컬 기준으로 전체 timeline scan 방식은 약 8.6초, `PHY_EPISODE_INDEX` 사용 방식은 약 0.01초가 걸렸습니다.

기본 dataset/sequence:

```text
dataset: humanoid-everyday
sequence: humanoid-everyday-10m
```

현재 35개 대표 episode의 실제 길이는 약 8.76분입니다. `humanoid-everyday-10m`은 sequence 이름으로 유지되는 식별자입니다.

PCD LiDAR는 API가 바로 전송할 수 있도록 점 하나를 16 bytes의 little-endian float32 값으로 저장합니다.

```text
x float32
y float32
z float32
intensity float32
```

PCD에 intensity 필드가 없으면 `1.0`으로 저장합니다.

## 8. 데모 서버 실행

JSH shell:

```text
/work > /work/app/server.js --host 127.0.0.1 --port 56802
```

또는 Linux shell에서 JSH 런타임으로 바로 실행합니다.

```sh
export NEO_HOME=<NEO_HOME>
cd <NEO_HOME>/public/neo-humanoid-demo
"$NEO_HOME/machbase-neo" jsh -v /work="$(pwd)" \
  /work/app/server.js --host 127.0.0.1 --port 56802
```

기대 출력:

```text
neo-humanoid-demo server started tcp 127.0.0.1:56802
```

브라우저:

```text
http://127.0.0.1:56802/
```

Neo file explorer 또는 package 화면에서 `public/index.html`을 직접 열어 사용할 때는 URL에 `?apiBase=http://127.0.0.1:56802`를 붙입니다. `/db/tql/...` 경로는 TQL 실행 API이므로 이 HTML 파일을 여는 경로로 사용하지 않습니다.

## API 확인

Linux shell:

```sh
curl http://127.0.0.1:56802/api/health
curl http://127.0.0.1:56802/api/manifest
curl http://127.0.0.1:56802/api/episodes
curl 'http://127.0.0.1:56802/api/frame?frameId=100'
curl 'http://127.0.0.1:56802/api/points?frameId=100&lod=2'
curl 'http://127.0.0.1:56802/api/export/timeline-query?episode=0'
curl -D - 'http://127.0.0.1:56802/api/export/episode.zip?episode=0' -o /tmp/neo-humanoid-episode0.zip
```

첫 task smoke 적재 후 `/api/episodes`는 `episodeCount: 1`을 반환합니다. 대표 catalog 전체 적재가 끝나면 `episodeCount: 35`, OpenHE append까지 끝나면 `episodeCount: 36`을 반환합니다. 각 episode에는 `task`, `category`, `robotType`이 포함됩니다.

2026-06-07 전체 catalog API 검증 결과:

```text
/api/manifest        frameCount: 15805, durationMs: 526800, source: machbase
/api/episodes        episodeCount: 35
/api/frame?frameId=100  ok: true, sourceEpisode: align_a_stack_of_books/episode_0
/api/points.bin?frameId=100&lod=2  HTTP 200, x-neo-point-count: 142
/api/export/episode.zip?episode=0  HTTP 200, manifest/timeline/lidar files 포함
```

`/api/points.bin`은 browser UI가 우선 사용하는 binary endpoint입니다.

```sh
curl -D - 'http://127.0.0.1:56802/api/points.bin?frameId=100&lod=2' -o /tmp/neo-humanoid-points.bin
```

응답 header:

```text
x-neo-source
x-neo-lod
x-neo-frame-id
x-neo-point-count
x-neo-byte-count
```

센서 데이터 다운로드:

- UI의 `Download sensors`는 선택된 episode의 센서 데이터를 ZIP으로 받습니다.
- UI의 `Copy query`는 같은 episode를 Machbase Neo HTTP API `/db/query`에서 NDJSON으로 받을 수 있는 URL을 복사합니다.
- ZIP에는 `manifest.json`, `timeline.ndjson`, `lidar.frames.ndjson`, `lidar/*.xyzi.bin`이 포함됩니다.
- `timeline.ndjson`은 `PHY_TIMELINE`의 한 frame당 한 줄 JSON이고, `lidar/*.xyzi.bin`은 점 하나를 little-endian float32 `x,y,z,intensity` 16 bytes로 저장합니다.
- 직접 링크는 Machbase Neo HTTP Query API 형식인 `/db/query?q=...&format=ndjson&compress=gzip&timeformat=ns`를 사용합니다. 참고: https://docs.machbase.com/neo/api-http/query/

공간 포인트 downsample 정책:

```text
LOD 0: 원본 point에 가장 가까움
LOD 1: 4개 중 1개 point 사용
LOD 2: 12개 중 1개 point 사용
```

DB에는 LOD별 데이터를 따로 저장하지 않고, API가 요청 시 downsample합니다. `--point-frame-stride`로 일부 프레임에만 LiDAR를 저장한 경우 `/api/points.bin`은 같은 episode 안에서 요청 프레임 이전의 가장 가까운 point frame을 재사용합니다. OpenHE처럼 원본에 LiDAR가 없는 episode는 `0 points`를 반환합니다.

## 화면 구성

브라우저 데모는 다음을 표시합니다.

- Unitree G1 공식 mesh 기반 3D 휴머노이드와 시간별 관절 동작
- 로봇 주변 공간 포인트와 센서 시야
- frame, robot type, episode/source step, speed
- 관절 activity bar, IMU attitude, hand pressure strip
- RGB/depth/LiDAR media 상태
- Machbase query latency
- task/category 선택, episode 선택, 재생/정지와 timeline 이동
- Follow, High Follow, Orbit, Top, Front, Side, Rear, Shoulder 카메라 view point 선택

## 3D 모델 리소스

브라우저 렌더링에는 Unitree의 공식 G1 29DOF URDF/STL visual asset을 사용합니다.

```text
source: https://github.com/unitreerobotics/unitree_ros
files:
  robots/g1_description/g1_29dof_rev_1_0.urdf
  robots/g1_description/meshes/*.STL
local:
  public/assets/robots/unitree_g1/
license: BSD 3-Clause
```

`public/unitree-g1.js`는 브라우저에서 URDF를 파싱하고 STL mesh를 로드한 뒤, Humanoid Everyday의 `leg_state`와 `arm_state` 배열을 G1 joint 이름에 매핑합니다. 모델 로딩에 실패하면 `public/app.js`의 procedural humanoid가 fallback으로 그대로 표시됩니다.

## 문제 해결

데이터가 없는데 UI가 뜨는 경우:

```text
sourceLabel이 synthetic fallback until data is ingested 로 표시됩니다.
```

Machbase DB 연결 실패:

```text
PHY_DB_HOST, PHY_DB_PORT, PHY_DB_USER, PHY_DB_PASSWORD 값을 확인합니다.
Machbase Neo DB가 127.0.0.1:5656에서 실행 중인지 확인합니다.
```

대표 task가 35개보다 적게 보이는 경우:

```text
/work/scripts/check-data.js --data-root data/raw/humanoid-everyday
curl http://127.0.0.1:56802/api/episodes
```

`/api/episodes`의 `episodeCount`가 35보다 작으면 catalog 생성, ZIP 다운로드, 첫 episode 추출, `--catalog-only --episode-limit-per-task 1` ingest 명령을 다시 확인합니다.

PCD point가 보이지 않는 경우:

```text
media.lidar 값이 0인지 확인합니다.
episode 내부 lidar/*.pcd 경로 또는 data.json의 lidar_path 계열 필드를 확인합니다.
```

Neo file explorer 또는 package 화면에서 `public/index.html`은 열리지만 API가 실패하는 경우:

```text
?apiBase=http://127.0.0.1:56802 를 URL에 붙입니다.
데모 API 서버가 /work/app/server.js로 실행 중인지 확인합니다.
```
