'use strict';

const TABLES = {
  timeline: 'PHY_TIMELINE',
  points: 'PHY_POINT_FRAME',
  lidar: 'PHY_POINT_FRAME',
  episodeIndex: 'PHY_EPISODE_INDEX'
};

const LEGACY_TABLES = [
  'PHY_FRAME',
  'PHY_SIGNAL',
  'PHY_EVENT',
  'PHY_LIDAR_FRAME',
  'PHY_LIDAR_CHUNK'
];

const DDL = [
  `CREATE TAG TABLE ${TABLES.timeline} (
    name varchar(128) primary key,
    time datetime basetime,
    value json,
    frame_id long
  )
  METADATA (
    dataset varchar(32),
    sequence varchar(64),
    stream varchar(32),
    source varchar(32)
  )
  TAG_PARTITION_COUNT=1`,

  `CREATE TABLE ${TABLES.points} (
    name varchar(160),
    time datetime,
    value binary,
    frame_id long,
    point_count integer,
    byte_count integer,
    dataset varchar(32),
    sequence varchar(64),
    source_episode varchar(160),
    source_step integer
  )`,

  `CREATE TABLE ${TABLES.episodeIndex} (
    dataset varchar(32),
    sequence varchar(64),
    episode_index integer,
    source_episode varchar(160),
    task varchar(160),
    category varchar(64),
    description varchar(512),
    robot_type varchar(16),
    frame_start long,
    frame_end long,
    frame_count long,
    step_start integer,
    step_end integer,
    min_time datetime,
    max_time datetime,
    duration_ms long,
    point_frames long
  )`,

];

const INDEXES = [
  {
    name: 'IDX_PHY_TIMELINE_FRAME_ID',
    ddl: `CREATE INDEX IDX_PHY_TIMELINE_FRAME_ID ON ${TABLES.timeline}(frame_id) INDEX_TYPE TAG`
  },
  {
    name: 'IDX_PHY_POINT_FRAME_ID',
    ddl: `CREATE INDEX IDX_PHY_POINT_FRAME_ID ON ${TABLES.points}(frame_id) INDEX_TYPE LSM`
  }
];

function tableExists(conn, name) {
  try {
    const rows = conn.query('SELECT NAME FROM M$SYS_TABLES WHERE NAME = ?', name);
    for (const row of rows) {
      rows.close && rows.close();
      return !!(row && row.NAME);
    }
    rows.close && rows.close();
  } catch (_) {}
  return false;
}

function indexExists(conn, name) {
  try {
    const rows = conn.query('SELECT NAME FROM M$SYS_INDEXES WHERE NAME = ?', name);
    for (const row of rows) {
      rows.close && rows.close();
      return !!(row && row.NAME);
    }
    rows.close && rows.close();
  } catch (_) {}
  return false;
}

function ensureSchema(conn) {
  const created = [];
  for (let i = 0; i < DDL.length; i++) {
    const ddl = DDL[i];
    const match = ddl.match(/CREATE(?:\s+TAG)?\s+TABLE\s+([A-Z0-9_]+)/i);
    const table = match ? match[1].toUpperCase() : '';
    if (table && tableExists(conn, table)) continue;
    conn.exec(ddl);
    created.push(table);
  }
  for (let i = 0; i < INDEXES.length; i++) {
    const index = INDEXES[i];
    if (indexExists(conn, index.name)) continue;
    conn.exec(index.ddl);
    created.push(index.name);
  }
  return created;
}

module.exports = {
  DDL,
  INDEXES,
  LEGACY_TABLES,
  TABLES,
  ensureSchema
};
