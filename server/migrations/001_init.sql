CREATE TABLE IF NOT EXISTS schemas (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_fields (
  id          SERIAL PRIMARY KEY,
  schema_id   INT REFERENCES schemas(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  field_type  TEXT NOT NULL DEFAULT 'text',
  required    BOOLEAN DEFAULT false,
  options     JSONB,
  position    INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trees (
  id         SERIAL PRIMARY KEY,
  schema_id  INT REFERENCES schemas(id) ON DELETE RESTRICT,
  title      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nodes (
  id        SERIAL PRIMARY KEY,
  tree_id   INT REFERENCES trees(id) ON DELETE CASCADE,
  parent_id INT REFERENCES nodes(id) ON DELETE CASCADE,
  position  INT NOT NULL DEFAULT 0,
  data      JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_schema_fields_schema_id ON schema_fields(schema_id);
CREATE INDEX IF NOT EXISTS idx_trees_schema_id        ON trees(schema_id);
CREATE INDEX IF NOT EXISTS idx_nodes_tree_id          ON nodes(tree_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent_id        ON nodes(parent_id);
