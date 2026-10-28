import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    bom_json: {
                        table: 'sys_module'
                        id: 'd9b48b4fd7c4406583535934478c82db'
                    }
                    'docsera-friendly-url-proof-page-read': {
                        table: 'sys_security_acl'
                        id: '879785c448564188a54416cb90d18c14'
                    }
                    'docsera-global-workspace-membership-bridge': {
                        table: 'sys_script_include'
                        id: '5bf5c028daaa417d88de36616e4c8300'
                    }
                    'docsera-global-workspace-provisioning-bridge': {
                        table: 'sys_script_include'
                        id: 'abf83bf6db1e46dea88c97ec493153bc'
                    }
                    'docsera-workspace-create': {
                        table: 'sys_scope_privilege'
                        id: '9f92dc99a2cc467792837aaa2eda7685'
                    }
                    'docsera-workspace-delete': {
                        table: 'sys_scope_privilege'
                        id: '957dd0a5355f409084022a37f40c35ab'
                    }
                    'docsera-workspace-icon-asset-read': {
                        table: 'sys_scope_privilege'
                        id: 'e5de9fae882e41f4ae5e5936a6141657'
                    }
                    'docsera-workspace-icon-asset-write': {
                        table: 'sys_scope_privilege'
                        id: '0d4d751c513343088b88326ab5354c71'
                    }
                    'docsera-workspace-member-mutation-command-read': {
                        table: 'sys_scope_privilege'
                        id: '1bbfe8f3691f4d7981a769118c65249f'
                    }
                    'docsera-workspace-member-mutation-command-worker': {
                        table: 'sys_script'
                        id: '0d2f3146f31d4c439ea6b6cd50a105a2'
                    }
                    'docsera-workspace-member-mutation-command-write': {
                        table: 'sys_scope_privilege'
                        id: '86ca73048d744baeb377d39abd8b9e09'
                    }
                    'docsera-workspace-provision-request-read': {
                        table: 'sys_scope_privilege'
                        id: '9bee1d780be04e5790100aedb520cf64'
                    }
                    'docsera-workspace-provision-request-worker': {
                        table: 'sys_script'
                        id: 'fa8109eeb6ed4c3e91c11238db780568'
                    }
                    'docsera-workspace-provision-request-write': {
                        table: 'sys_scope_privilege'
                        id: 'e27d95e53c7447b29ab1fb9f94284418'
                    }
                    'docsera-workspace-read': {
                        table: 'sys_scope_privilege'
                        id: '180009d4ff894e0baadce8a57b91fd2f'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: 'e1db765a6cbc4f568b5196435a42ef7b'
                    }
                    'src_server_business-rules_process-workspace-member-mutation-command_js': {
                        table: 'sys_module'
                        id: '0e5b8251286449d9b67bcc50a68c489a'
                    }
                    'src_server_business-rules_process-workspace-provision-request_js': {
                        table: 'sys_module'
                        id: 'c91f8afbb5884bea9f4169994811d937'
                    }
                    'src_server_script-includes_docsera-global-workspace-membership-bridge_js': {
                        table: 'sys_module'
                        id: '7efb96fd25084bb886188a7b24bbbec0'
                    }
                    'src_server_script-includes_docsera-global-workspace-provisioning-bridge_js': {
                        table: 'sys_module'
                        id: 'dffea7d69a244e5ebc8cb193a29c5e92'
                    }
                }
                composite: [
                    {
                        table: 'sys_security_acl_role'
                        id: '1416f98418e24c18af184b0300f7793c'
                        deleted: true
                        key: {
                            sys_security_acl: '879785c448564188a54416cb90d18c14'
                            sys_user_role: {
                                id: '5783d8fea6d44949aaeb308b197412c2'
                                key: {
                                    name: 'x_82900_docsera.editor'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '271d5363931d4b57ac26212e883ed1ab'
                        key: {
                            name: 'global/docsera-friendly-url-proof'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: '377308e9610d4a5485845827fe52145a'
                        key: {
                            application_file: '8e4cefdd7fdd40f493c43fd2630de2c8'
                            source_artifact: '97384beb48c7467b9d0c93f66c0f2d83'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '8e4cefdd7fdd40f493c43fd2630de2c8'
                        key: {
                            name: 'global/docsera-friendly-url-proof.js.map'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: '960753b5fc02488881af288ac6a8c24f'
                        key: {
                            application_file: 'de3b81474ba94c0a9296d12f9c6bd9cc'
                            source_artifact: '97384beb48c7467b9d0c93f66c0f2d83'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact'
                        id: '97384beb48c7467b9d0c93f66c0f2d83'
                        key: {
                            name: 'docsera.do - BYOUI Files'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: 'd4b68208d7494aedabda32ae9cc5c214'
                        key: {
                            application_file: '271d5363931d4b57ac26212e883ed1ab'
                            source_artifact: '97384beb48c7467b9d0c93f66c0f2d83'
                        }
                    },
                    {
                        table: 'sys_ui_page'
                        id: 'de3b81474ba94c0a9296d12f9c6bd9cc'
                        key: {
                            name: 'docsera'
                        }
                    },
                ]
            }
        }
    }
}
