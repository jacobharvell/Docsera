import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    bom_json: {
                        table: 'sys_module'
                        id: '035d3e11746f42faa56baf67d7f58279'
                    }
                    'docsera-runtime-api': {
                        table: 'sys_ws_definition'
                        id: '814e0e79e0734df7af652df1e048a18f'
                    }
                    'docsera-runtime-ping-get': {
                        table: 'sys_ws_operation'
                        id: 'a054642614c6403a92e30682e1de4aec'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: '59eb37ac11e3463591b83e545fd64cc4'
                    }
                    'src_server_api_docsera-runtime-ping_ts': {
                        table: 'sys_module'
                        id: '0cae8437f1b24d1b8e2e27367ffef695'
                    }
                }
                composite: [
                    {
                        table: 'sys_ui_page'
                        id: '053e258583814373a3f0ef19199023b4'
                        key: {
                            endpoint: 'x_82900_docsera_docsera_sdk_runtime.do'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '1acd40f0fcb0422e8e047afac7546c60'
                        key: {
                            name: 'x_82900_docsera/main'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '49074d350f4742d1a1dc581518fd6686'
                        key: {
                            name: 'x_82900_docsera/main.js.map'
                        }
                    },
                ]
            }
        }
    }
}
