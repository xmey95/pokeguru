/** CLI arguments for model-generated commands. Authentication still uses CODEX_HOME. */
export const CODEX_ISOLATION_ARGS = [
  '--ignore-user-config', '--ignore-rules',
  '--disable', 'apps', '--disable', 'plugins', '--disable', 'shell_tool',
  '--disable', 'multi_agent', '--disable', 'hooks', '--disable', 'remote_plugin',
  '--config', 'web_search="disabled"',
  '--config', 'project_doc_max_bytes=0',
  '--config', 'default_permissions="pokeguru"',
  '--config', 'permissions.pokeguru.filesystem={":root"="deny",":minimal"="read",":workspace_roots"={"."="read"}}',
  '--config', 'permissions.pokeguru.network.enabled=false',
  '--config', 'windows.sandbox="mxc"'
] as const
