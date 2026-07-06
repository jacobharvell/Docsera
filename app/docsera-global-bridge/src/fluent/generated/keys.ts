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
                    'docsera-global-workspace-provisioning-bridge': {
                        table: 'sys_script_include'
                        id: 'abf83bf6db1e46dea88c97ec493153bc'
                    }
                    'docsera-workspace-create': {
                        table: 'sys_scope_privilege'
                        id: '9f92dc99a2cc467792837aaa2eda7685'
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
                    'src_server_business-rules_process-workspace-provision-request_js': {
                        table: 'sys_module'
                        id: 'c91f8afbb5884bea9f4169994811d937'
                    }
                    'src_server_script-includes_docsera-global-workspace-provisioning-bridge_js': {
                        table: 'sys_module'
                        id: 'dffea7d69a244e5ebc8cb193a29c5e92'
                    }
                }
            }
        }
    }
}
