# Machbase Neo Humanoid Physical AI Demo

Humanoid Everyday 데이터를 Machbase Neo에 저장하고, 브라우저에서 휴머노이드 로봇의 3D 동작, 관절/IMU/손압력/오도메트리 센서 값, 주변 공간 포인트를 재생하는 데모입니다.

데모 목적은 Physical AI 센서 타임라인을 Machbase Neo에서 빠르게 저장/조회하고, 웹에서 시간축을 자유롭게 이동하며 로봇 동작과 센서 변화를 확인하는 것입니다.

## 데이터셋

사용 데이터셋:

```text
Humanoid Everyday
https://github.com/physical-superintelligence-lab/Humanoid-Everyday
```

Humanoid Everyday는 Unitree G1/H1 실제 로봇의 작업 수행 데이터를 포함합니다. 주요 센서는 관절 상태, IMU, 오도메트리, 손 센서/action, RGB, depth, LiDAR입니다. 전체 데이터셋은 매우 크므로 이 데모는 `data/catalog/humanoid-category-tasks.json`에 정의된 대표 task 7개를 사용하고, 각 task의 첫 번째 episode 1개만 Machbase Neo에 적재합니다.

## 실행 환경

이 문서는 명령 실행 위치를 분리해서 표기합니다.

| 표기 | 의미 | 사용하는 명령 |
|---|---|---|
| Linux shell | OS 터미널 | `git`, `unzip`, `curl`, `ss`, 환경변수 설정 |
| JSH shell | Machbase Neo JSH 내부 shell | `./scripts/*.js`, `./server.js` |

중요:

- JavaScript 코드는 Machbase Neo JSH에서 실행합니다.
- JSH shell은 Linux shell이 아니므로 `export`, `unzip`, redirection 같은 OS shell 명령을 직접 실행하지 않습니다.
- 이 package는 Machbase Neo 설치 디렉토리의 `public/neo-humanoid-demo` 아래에 있고, JSH에서는 package root가 `/work`로 보인다고 가정합니다.

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

## 전체 흐름

1. Linux shell에서 `<NEO_HOME>` 아래에 repository를 준비합니다.
2. Humanoid Everyday task ZIP URL을 확인합니다.
3. Linux shell에서 대표 task ZIP을 다운로드합니다.
4. Linux shell에서 각 ZIP의 첫 번째 episode만 압축 해제합니다.
5. JSH shell에서 데이터 구조를 확인합니다.
6. JSH shell에서 스키마 생성과 ingest를 실행합니다.
7. JSH shell에서 데모 서버를 실행하고 브라우저로 접속합니다.

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

대표 task catalog:

| category | task | robot |
|---|---|---|
| `articulate_object` | `press_the_stapler_g1` | G1 |
| `basic_manipulation` | `pull_a_chair_away_from_table_g1` | G1 |
| `deformable_object` | `unfold_a_tablet_cover_h1` | H1 |
| `high_precision` | `press_start_boiling_button` | H1 |
| `human_robot_interaction` | `pass_plates` | G1 |
| `loco_manipulation` | `walk_towards_the_cabinet_and_close_the_cabinet_door` | G1 |
| `tool_use` | `remove_a_soldering_gun_from_its_base_h1` | H1 |

Linux shell에서 catalog의 ZIP을 다운로드합니다. 압축 파일만 약 19 GiB입니다.

```sh
cd <NEO_HOME>/public/neo-humanoid-demo
mkdir -p data/raw/humanoid-everyday/archives data/raw/humanoid-everyday

node - <<'NODE' | sh
const fs = require('fs');
const path = require('path');
const items = JSON.parse(fs.readFileSync('data/catalog/humanoid-category-tasks.json', 'utf8'));
for (const item of items) {
  const archive = path.basename(item.url.split('?')[0]);
  const out = `data/raw/humanoid-everyday/archives/${archive}`;
  console.log(`test -f '${out}' || curl -L --fail --retry 3 --retry-delay 5 --connect-timeout 30 -o '${out}' '${item.url}'`);
}
NODE
```

ZIP 확인:

```sh
for z in data/raw/humanoid-everyday/archives/*.zip; do
  unzip -tq "$z"
done
```

JSH shell로 URL을 직접 받을 수도 있습니다. 다만 Dropbox ZIP은 크기 때문에 Linux shell의 `curl`을 권장합니다.

```text
/ > cd /work
/work > ./scripts/download-catalog.js --catalog data/catalog/humanoid-category-tasks.json --out data/raw/humanoid-everyday/archives
```

인증이 필요한 링크이거나 JSH HTTP 클라이언트가 접근할 수 없는 링크라면 Linux shell에서 직접 다운로드한 뒤 아래 위치에 둡니다.

```text
data/raw/humanoid-everyday/archives/task.zip
```

## 3. 압축 해제

전체 ZIP을 모두 풀면 수십 GiB 이상이 필요합니다. 데모는 각 대표 task의 첫 번째 episode만 사용하므로, 아래처럼 `data.json`이 있는 첫 번째 episode prefix만 추출합니다.

```sh
cd <NEO_HOME>/public/neo-humanoid-demo
ROOT="data/raw/humanoid-everyday"
ARCH="$ROOT/archives"

extract_first_episode() {
  zip="$1"
  task="$2"
  entry="$(unzip -Z1 "$zip" | awk -F/ '/(^|\/)episode_[0-9]+\/data\.json$/ {
    ep="";
    for (i=1; i<=NF; i++) if ($i ~ /^episode_[0-9]+$/) ep=$i;
    if (ep != "") print ep "\t" $0;
  }' | sort -t '_' -k2,2n | head -1 | cut -f2-)"
  prefix="${entry%/data.json}"
  if [ "${prefix%%/*}" = "$prefix" ]; then
    rm -rf "$ROOT/$task/$prefix" "$ROOT/$prefix"
    unzip -q -o "$zip" "$prefix/*" -d "$ROOT"
    mkdir -p "$ROOT/$task"
    mv "$ROOT/$prefix" "$ROOT/$task/$prefix"
  else
    rm -rf "$ROOT/$prefix"
    unzip -q -o "$zip" "$prefix/*" -d "$ROOT"
  fi
}

extract_first_episode "$ARCH/press_the_stapler_g1.zip" "press_the_stapler"
extract_first_episode "$ARCH/pull_a_chair_away_from_table_g1.zip" "pull_a_chair_away_from_table_g1"
extract_first_episode "$ARCH/unfold_a_tablet_cover_h1.zip" "unfold_a_tablet_cover"
extract_first_episode "$ARCH/press_start_boiling_button.zip" "press_start_boiling_button"
extract_first_episode "$ARCH/pass_plates.zip" "pass_plates"
extract_first_episode "$ARCH/walk_towards_the_cabinet_and_close_the_cabinet_door.zip" "walk_towards_the_cabinet_and_close_the_cabinet_door"
extract_first_episode "$ARCH/remove_a_soldering_gun_from_its_base_h1.zip" "remove_a_soldering_gun_from_its_base"
```

데모가 기대하는 episode 구조:

```text
data/raw/humanoid-everyday/.../episode_0/data.json
data/raw/humanoid-everyday/.../episode_0/color/*.jpg 또는 *.png
data/raw/humanoid-everyday/.../episode_0/depth/*
data/raw/humanoid-everyday/.../episode_0/lidar/*.pcd
```

`data.json`은 배열이거나 `data`, `steps`, `frames`, `episode` 중 하나의 배열 필드를 포함할 수 있습니다. 각 step에서 가능한 센서 필드를 읽고, 파일 경로가 명시되지 않은 RGB/depth/LiDAR는 `color/`, `depth/`, `lidar/` 디렉토리의 정렬 순서를 frame index에 맞춰 사용합니다.

## 4. 데이터 확인

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

이번 대표 catalog 추출 결과는 7개 대표 episode입니다. 기존에 다른 task를 풀어 둔 경우 `check-data.js`의 episode 수는 더 크게 보일 수 있지만, 아래 ingest 명령은 `--catalog-only`로 대표 task만 적재합니다.

검증한 대표 catalog 적재 결과:

```text
tasks: 7
frames: 2443
pointFrames: 221
durationMs: 81433
```

## 5. 스키마 생성

JSH shell:

```text
/work > ./scripts/schema.js
```

생성 테이블:

```text
PHY_TIMELINE
PHY_POINT_FRAME
```

주요 저장 관계:

| 원본 | Machbase 저장 |
|---|---|
| `data.json` step | `PHY_TIMELINE.value` JSON |
| step time 또는 30Hz frame time | `PHY_TIMELINE.time`, `PHY_POINT_FRAME.time` |
| `lidar/*.pcd` | `PHY_POINT_FRAME.value` binary |
| RGB/depth 파일 | `PHY_TIMELINE.value.media` 상대 경로 |

스키마만 출력:

```text
/work > ./scripts/schema.js --print
```

초기화가 필요할 때:

```text
/work > ./scripts/reset-schema.js
```

## 6. 데이터 적재

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

적재 결과:

```json
{
  "ok": true,
  "dataset": "humanoid-everyday",
  "sequence": "humanoid-everyday-10m",
  "sourceEpisodes": 7,
  "frames": 2443,
  "pointFrames": 221,
  "tasks": 7,
  "episodeLimitPerTask": 1,
  "pointStride": 4,
  "pointFrameStride": 10,
  "durationMs": 81433
}
```

`sourceEpisodes`는 raw 디렉토리에서 발견한 전체 episode 수입니다. 대표 catalog만 유지하면 이 값은 7입니다.

기본 dataset/sequence:

```text
dataset: humanoid-everyday
sequence: humanoid-everyday-10m
```

PCD LiDAR는 API가 바로 전송할 수 있도록 점 하나를 16 bytes의 little-endian float32 값으로 저장합니다.

```text
x float32
y float32
z float32
intensity float32
```

PCD에 intensity 필드가 없으면 `1.0`으로 저장합니다.

## 7. 데모 서버 실행

JSH shell:

```text
/work > cd app
/work/app > ./server.js --host 127.0.0.1 --port 56802
```

기대 출력:

```text
neo-humanoid-demo server started tcp 127.0.0.1:56802
```

브라우저:

```text
http://127.0.0.1:56802/
```

Machbase Neo package HTTP 경로로 열 때:

```text
http://127.0.0.1:5654/db/tql/neo-humanoid-demo/public/index.html?apiBase=http://127.0.0.1:56802
```

## API 확인

Linux shell:

```sh
curl http://127.0.0.1:56802/api/health
curl http://127.0.0.1:56802/api/manifest
curl http://127.0.0.1:56802/api/episodes
curl 'http://127.0.0.1:56802/api/frame?frameId=100'
curl 'http://127.0.0.1:56802/api/points?frameId=100&lod=2'
```

대표 catalog 적재가 끝나면 `/api/episodes`는 `episodeCount: 7`을 반환하고, 각 episode에 `task`, `category`, `robotType`이 포함됩니다.

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

공간 포인트 downsample 정책:

```text
LOD 0: 원본 point에 가장 가까움
LOD 1: 4개 중 1개 point 사용
LOD 2: 12개 중 1개 point 사용
```

DB에는 LOD별 데이터를 따로 저장하지 않고, API가 요청 시 downsample합니다. `--point-frame-stride`로 일부 프레임에만 LiDAR를 저장한 경우 `/api/points.bin`은 요청 프레임 이전의 가장 가까운 point frame을 재사용합니다.

## 화면 구성

브라우저 데모는 다음을 표시합니다.

- Unitree G1 공식 mesh 기반 3D 휴머노이드와 시간별 관절 동작
- 로봇 주변 공간 포인트와 센서 시야
- frame, robot type, episode/source step, speed
- 관절 activity bar, IMU attitude, hand pressure strip
- RGB/depth/LiDAR media 상태
- Machbase query latency
- task/category 선택, episode 선택, 재생/정지와 timeline 이동

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

대표 task가 7개보다 적게 보이는 경우:

```text
./scripts/check-data.js --data-root data/raw/humanoid-everyday
curl http://127.0.0.1:56802/api/episodes
```

`/api/episodes`의 `episodeCount`가 7보다 작으면 catalog ZIP 다운로드, 첫 episode 추출, `--catalog-only --episode-limit-per-task 1` ingest 명령을 다시 확인합니다.

PCD point가 보이지 않는 경우:

```text
media.lidar 값이 0인지 확인합니다.
episode 내부 lidar/*.pcd 경로 또는 data.json의 lidar_path 계열 필드를 확인합니다.
```

브라우저에서 package HTTP 경로는 열리지만 API가 실패하는 경우:

```text
?apiBase=http://127.0.0.1:56802 를 URL에 붙입니다.
데모 API 서버가 app/server.js로 실행 중인지 확인합니다.
```
