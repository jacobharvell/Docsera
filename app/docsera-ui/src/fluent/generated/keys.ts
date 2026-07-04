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
                    'docsera-runtime-workspaces-post': {
                        table: 'sys_ws_operation'
                        id: '05e86307b95e4b549a1e6b87059767fe'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: '59eb37ac11e3463591b83e545fd64cc4'
                    }
                    'src_server_api_docsera-runtime-create-workspace_ts': {
                        table: 'sys_module'
                        id: 'd1c85ce69fec4046a9c4e52ccbf1ed4e'
                    }
                    'src_server_api_docsera-runtime-ping_ts': {
                        table: 'sys_module'
                        id: '0cae8437f1b24d1b8e2e27367ffef695'
                    }
                    src_server_workspaces_serviceNowWorkspaceProvisioning_ts: {
                        table: 'sys_module'
                        id: 'af3b3203ec254b04a09ca602a42829e7'
                    }
                    'styles/global.css': {
                        table: 'sys_ux_theme_asset'
                        id: '6ac9ba7a29374177868bee0c33d414ea'
                    }
                    'styles\\global.css': {
                        table: 'sys_ux_theme_asset'
                        id: '7b5fd84f4e72418183171b7e16c36c88'
                        deleted: true
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
                        table: 'sys_dictionary'
                        id: '1752290f722044ae829fc6741284063d'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'status'
                        }
                    },
                    {
                        table: 'sys_user_role'
                        id: '1a567676cd914d03967f6ccf5d4a3216'
                        key: {
                            name: 'x_82900_docsera.admin'
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
                        table: 'sys_user_role_contains'
                        id: '1addaaf5f12c44ce8a0e73e4181e6a97'
                        key: {
                            role: {
                                id: '1a567676cd914d03967f6ccf5d4a3216'
                                key: {
                                    name: 'x_82900_docsera.admin'
                                }
                            }
                            contains: {
                                id: 'bed03ee93aa74f62aedc3ee7d9419ca6'
                                key: {
                                    name: 'x_82900_docsera.workspace_admin'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '1c3d13975aa741a998b2e6dce3a06e4c'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'name'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '1ce4c32417624c499d157d2e93db9925'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'icon_asset_path'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '22f8b7d2f45549efb6d75352e74dd344'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'admin_group'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: '2463e62d7f204a8c8dbd25611ce729e2'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'icon_type'
                            value: 'uploaded'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '2eb8d2cc6be748e59dce02f8cb0f72da'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'creator'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_user_role_contains'
                        id: '30992d441c7448029b72968730aa3732'
                        key: {
                            role: {
                                id: 'bed03ee93aa74f62aedc3ee7d9419ca6'
                                key: {
                                    name: 'x_82900_docsera.workspace_admin'
                                }
                            }
                            contains: {
                                id: '4b00751fca4346129d38f205fda047c5'
                                key: {
                                    name: 'x_82900_docsera.editor'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '3b361239d4d8408084f51d8447e7774a'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'editor_group'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '41408d857edb4c438d55723e36b1b647'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'page_width'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '49074d350f4742d1a1dc581518fd6686'
                        key: {
                            name: 'x_82900_docsera/main.js.map'
                        }
                    },
                    {
                        table: 'sys_user_role'
                        id: '4b00751fca4346129d38f205fda047c5'
                        key: {
                            name: 'x_82900_docsera.editor'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '549495bdadcc420bb1e5f118ac594723'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'icon_asset_path'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: '56168c6134f84f99a04ea0fa064acc7f'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'icon_type'
                            value: 'builtin'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '5f21ea08b3954b26aa10dad29f8e65bc'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'icon_label'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '6c1f6374f5d541b5ab61bbc14a10fa92'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'name'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '71156072c71c47c487cc4998f1b93a33'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'NULL'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '762f9d23622a4ed3b0bdf2eed566f281'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'workspace_slug'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '7aa94fed138443769cbf4eb62218ffd2'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'creator'
                        }
                    },
                    {
                        table: 'sys_choice_set'
                        id: '7cab1b4bb3324b4f8e84d98a12757582'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'status'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '8c0fb83766034352a85434dd998ec602'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'icon_label'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_choice_set'
                        id: '8cd12dc2c2f04a339714d6180ba9bd59'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'page_width'
                        }
                    },
                    {
                        table: 'ua_table_licensing_config'
                        id: '8f8f344fa21c46e2b6aa649ecbdabf86'
                        key: {
                            name: 'x_82900_docsera_workspace'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '929848174fdb4e8fb840dfb25012b5ed'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'icon_type'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '9c5dcc38667441a0af4feb829411241b'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'icon_type'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'a0347a2fdeaf415fab42466786e5cbaa'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'NULL'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'a44879e2ad2c4b0f8187c8174f1aacd5'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'icon_key'
                        }
                    },
                    {
                        table: 'sys_db_object'
                        id: 'a58cf7c84e0f48cca450fc37d769fa54'
                        key: {
                            name: 'x_82900_docsera_workspace'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'a5d51d9ddb304c588a6d5a2648d46d17'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'status'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: 'a70a7ff84438414bad1743d882cd47e5'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'page_width'
                            value: 'full'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: 'aa790e95ebac4586971985ab588e7f94'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'status'
                            value: 'inactive'
                        }
                    },
                    {
                        table: 'sys_choice_set'
                        id: 'b1a0ba2336c142e385af12bb10e85abd'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'icon_type'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'b25a8604611b4423b5aa2e9cd97fa8f2'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'icon_key'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'b2ff9b3e232745fe904be4b441b5627a'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'toc_default_visible'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'b38a5a5536bc4e83a1399febe4884fb7'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'editor_group'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'b587318c1f9440909e70ffa726698d15'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'short_description'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'be9b39d74d6147d3a8972a05c2bd28dc'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'short_description'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_user_role'
                        id: 'bed03ee93aa74f62aedc3ee7d9419ca6'
                        key: {
                            name: 'x_82900_docsera.workspace_admin'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'bfea5649cb1e44168bb0d6e77774ca3d'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'page_width'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: 'c5f8f78942fb460a93a94a2777073089'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'page_width'
                            value: 'readable'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'c6139871a8234ea5ac037bd1b225b70b'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'admin_group'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'cb6386dd32a5421bbc7f5cd51e8cc657'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'toc_default_visible'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: 'ced2cb2112894c089235b6b72dea6b1f'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'status'
                            value: 'active'
                        }
                    },
                    {
                        table: 'sys_user_role_contains'
                        id: 'dd1251e68d2641a78c7984e114cde142'
                        key: {
                            role: {
                                id: '1a567676cd914d03967f6ccf5d4a3216'
                                key: {
                                    name: 'x_82900_docsera.admin'
                                }
                            }
                            contains: {
                                id: '4b00751fca4346129d38f205fda047c5'
                                key: {
                                    name: 'x_82900_docsera.editor'
                                }
                            }
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'e4678526df0843ba8504ddecff18d3e3'
                        key: {
                            name: 'x_82900_docsera_workspace'
                            element: 'workspace_slug'
                            language: 'en'
                        }
                    },
                ]
            }
        }
    }
}
