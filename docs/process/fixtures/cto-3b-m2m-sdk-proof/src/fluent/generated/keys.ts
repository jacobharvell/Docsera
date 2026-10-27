import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    bom_json: {
                        table: 'sys_module'
                        id: 'c90ae60516ab44f8bb8bb6f661bb2c29'
                    }
                    'cto-3b-removal-member-m2m': {
                        table: 'sys_m2m'
                        id: 'eb40cf454d4b4beeb563c9b01413f6fd'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: 'a1f1502d0a4c462fa7a8bf7b17c7b84c'
                    }
                }
                composite: [
                    {
                        table: 'sys_dictionary'
                        id: '0060df85777c4c4aad01c160c828d69e'
                        key: {
                            name: 'x_82900_docsera_rm_member'
                            element: 'page'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '2d897751a1ac4ef7936e5cccd3463a67'
                        key: {
                            name: 'x_82900_docsera_rm_member'
                            element: 'NULL'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '2f4162cae55f459689717575ca8b1369'
                        key: {
                            name: 'x_82900_docsera_rm_member'
                            element: 'first_pending_sequence'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '333c036e79844501be75afa6924a67d4'
                        key: {
                            name: 'x_82900_docsera_rm_member'
                            element: 'NULL'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'a9b970be70e745baab24111b01663b2a'
                        key: {
                            name: 'x_82900_docsera_rm_member'
                            element: 'page'
                            language: 'en'
                        }
                    },
                    {
                        table: 'ua_table_licensing_config'
                        id: 'b5f3400236ba4dec9a17cb46593d10b3'
                        key: {
                            name: 'x_82900_docsera_rm_member'
                        }
                    },
                    {
                        table: 'sys_index'
                        id: 'd6be876f712b457294669fc6eec291c9'
                        key: {
                            logical_table_name: 'x_82900_docsera_rm_member'
                            col_name_string: 'removal_batch,page'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'd9ad0f8dd6834bc39daa38a9b6810da6'
                        key: {
                            name: 'x_82900_docsera_rm_member'
                            element: 'removal_batch'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'e88ca578aea840ad8b685afd7db1c770'
                        key: {
                            name: 'x_82900_docsera_rm_member'
                            element: 'first_pending_sequence'
                        }
                    },
                    {
                        table: 'sys_db_object'
                        id: 'f3672bf1c7d34a2dbd4b8e5bea187c86'
                        key: {
                            name: 'x_82900_docsera_rm_member'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'f48454394566490996711ff267621f9b'
                        key: {
                            name: 'x_82900_docsera_rm_member'
                            element: 'removal_batch'
                            language: 'en'
                        }
                    },
                ]
            }
        }
    }
}
