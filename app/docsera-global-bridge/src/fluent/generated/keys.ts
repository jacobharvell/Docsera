import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    bom_json: {
                        table: 'sys_module'
                        id: '582d44e43f714b8cb0ebbffe9b4fa991'
                    }
                    'docsera-friendly-url-proof-page-read': {
                        table: 'sys_security_acl'
                        id: 'b9d7e176310f447ea61072dc4a9fca11'
                    }
                    'docsera-global-workspace-membership-bridge': {
                        table: 'sys_script_include'
                        id: 'bb42e634e203492591a8d18e6953eae1'
                    }
                    'docsera-global-workspace-provisioning-bridge': {
                        table: 'sys_script_include'
                        id: '010930ea12354689b678fc9b37ba0f88'
                    }
                    'docsera-workspace-create': {
                        table: 'sys_scope_privilege'
                        id: 'd4959e2588174efda0d5769c9861cc9b'
                    }
                    'docsera-workspace-delete': {
                        table: 'sys_scope_privilege'
                        id: 'eaf188f8dcc240e896b30a140aa28dfa'
                    }
                    'docsera-workspace-icon-asset-read': {
                        table: 'sys_scope_privilege'
                        id: 'a9463de9f8f24cc9be7296b8e1019ddc'
                    }
                    'docsera-workspace-icon-asset-write': {
                        table: 'sys_scope_privilege'
                        id: '8c73924ac3f34315a312d25c04beca68'
                    }
                    'docsera-workspace-member-mutation-command-read': {
                        table: 'sys_scope_privilege'
                        id: '44a6377dac404a3885de4107e29aa707'
                    }
                    'docsera-workspace-member-mutation-command-worker': {
                        table: 'sys_script'
                        id: 'f91e7303f060417e97e9b6ea7d34efbe'
                    }
                    'docsera-workspace-member-mutation-command-write': {
                        table: 'sys_scope_privilege'
                        id: '020b66150c26442d80ec0a26b6f37099'
                    }
                    'docsera-workspace-provision-request-read': {
                        table: 'sys_scope_privilege'
                        id: '2a575e9f2d314c9aa08c6e4fa60b545a'
                    }
                    'docsera-workspace-provision-request-worker': {
                        table: 'sys_script'
                        id: 'c7debb094bef4e5093645239504c84b6'
                    }
                    'docsera-workspace-provision-request-write': {
                        table: 'sys_scope_privilege'
                        id: 'd48779f205ab43da816d52079e0150c0'
                    }
                    'docsera-workspace-read': {
                        table: 'sys_scope_privilege'
                        id: 'd4f3ccc29a484d13b8aada2b3a015d34'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: '4a22dfafc6cc4b01a796c36fa2d7e6b6'
                    }
                    'src_server_business-rules_process-workspace-member-mutation-command_js': {
                        table: 'sys_module'
                        id: '94bc0de883764e819b01d8b0ae0d62ec'
                    }
                    'src_server_business-rules_process-workspace-provision-request_js': {
                        table: 'sys_module'
                        id: 'f7a3b9131ef04ac5aebf403d2856e72c'
                    }
                    'src_server_script-includes_docsera-global-workspace-membership-bridge_js': {
                        table: 'sys_module'
                        id: '582ab55688144454bc95080a6ce5885f'
                    }
                    'src_server_script-includes_docsera-global-workspace-provisioning-bridge_js': {
                        table: 'sys_module'
                        id: 'd4a3dc19596e40aea9186c8eac8079b0'
                    }
                }
                composite: [
                    {
                        table: 'sn_glider_source_artifact'
                        id: '0e9aae1442c1423b879e5d4450aef278'
                        key: {
                            name: 'docsera.do - BYOUI Files'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: '14d95e5997f24eec9d14440cc042d0f4'
                        key: {
                            application_file: '7c2ec161a0214744aa75f7d22e6edf59'
                            source_artifact: '0e9aae1442c1423b879e5d4450aef278'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '377d32f160d24dafa9959f5d346c042d'
                        key: {
                            name: 'global/docsera-friendly-url-proof.js.map'
                        }
                    },
                    {
                        table: 'sys_ui_page'
                        id: '4bb3dc32dcfc4441a57bfce97db77529'
                        key: {
                            name: 'docsera'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '7c2ec161a0214744aa75f7d22e6edf59'
                        key: {
                            name: 'global/docsera-friendly-url-proof'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: 'a1c736eb5611452da1b5d341cf34d77b'
                        key: {
                            application_file: '4bb3dc32dcfc4441a57bfce97db77529'
                            source_artifact: '0e9aae1442c1423b879e5d4450aef278'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: 'c2d43b9b6a74482e9e40de0221ce9822'
                        key: {
                            application_file: '377d32f160d24dafa9959f5d346c042d'
                            source_artifact: '0e9aae1442c1423b879e5d4450aef278'
                        }
                    },
                ]
            }
        }
    }
}
