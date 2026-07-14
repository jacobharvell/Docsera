import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    '77e04e2dc3024f50c569bf0d0501319a': {
                        table: 'sys_scope_privilege'
                        id: '77e04e2dc3024f50c569bf0d0501319a'
                        deleted: true
                    }
                    bom_json: {
                        table: 'sys_module'
                        id: '035d3e11746f42faa56baf67d7f58279'
                    }
                    'docsera-global-workspace-provisioning-bridge-execute': {
                        table: 'sys_scope_privilege'
                        id: 'b523541000134b7ba376fb9302a1857f'
                        deleted: true
                    }
                    'docsera-page-edit-lock-cleanup': {
                        table: 'sysauto_script'
                        id: '06461d4fa9594dcb8274d639163414eb'
                    }
                    'docsera-runtime-api': {
                        table: 'sys_ws_definition'
                        id: '814e0e79e0734df7af652df1e048a18f'
                    }
                    'docsera-runtime-page-lock-acquire-post': {
                        table: 'sys_ws_operation'
                        id: 'ff6de44fafc74757a38a033a535a5f8d'
                    }
                    'docsera-runtime-page-lock-heartbeat-post': {
                        table: 'sys_ws_operation'
                        id: '8e1f70f25d914d4cb23e71c3684a17a0'
                    }
                    'docsera-runtime-page-lock-release-post': {
                        table: 'sys_ws_operation'
                        id: '59b2d849d6094387976dee26f8140d92'
                    }
                    'docsera-runtime-page-lock-status-post': {
                        table: 'sys_ws_operation'
                        id: '03f65fabd7744fc8a8da96d1415206d8'
                    }
                    'docsera-runtime-pages-delete': {
                        table: 'sys_ws_operation'
                        id: 'd731c28132024a66bfa57ebb20d175ee'
                    }
                    'docsera-runtime-pages-delete-action-post': {
                        table: 'sys_ws_operation'
                        id: 'bd0bda51ce3549f69dcdf70235f07629'
                    }
                    'docsera-runtime-pages-get': {
                        table: 'sys_ws_operation'
                        id: '2c1ee14346fb48d69552e328e5c980be'
                    }
                    'docsera-runtime-pages-patch': {
                        table: 'sys_ws_operation'
                        id: '6aa2c4f5b3d44d2f8d8e8f7f1f6a0c1b'
                    }
                    'docsera-runtime-pages-post': {
                        table: 'sys_ws_operation'
                        id: '0123141679ea4a7b9bbf5c118e10360b'
                    }
                    'docsera-runtime-pages-put': {
                        table: 'sys_ws_operation'
                        id: '6ffe3ab21b874ff6b0540f5fcddb56bf'
                    }
                    'docsera-runtime-ping-get': {
                        table: 'sys_ws_operation'
                        id: 'a054642614c6403a92e30682e1de4aec'
                    }
                    'docsera-runtime-workspace-provisioning-status-get': {
                        table: 'sys_ws_operation'
                        id: 'd6b8cefeabf34dab9fa3bd1f9a92d97f'
                    }
                    'docsera-runtime-workspaces-get': {
                        table: 'sys_ws_operation'
                        id: 'fcc3ff0a938442a2921579852f5aebea'
                    }
                    'docsera-runtime-workspaces-post': {
                        table: 'sys_ws_operation'
                        id: '05e86307b95e4b549a1e6b87059767fe'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: '59eb37ac11e3463591b83e545fd64cc4'
                    }
                    'src_server_api_docsera-runtime-create-page_ts': {
                        table: 'sys_module'
                        id: '2402bb56614747d5b42d7669793745fc'
                    }
                    'src_server_api_docsera-runtime-create-workspace_ts': {
                        table: 'sys_module'
                        id: 'd1c85ce69fec4046a9c4e52ccbf1ed4e'
                    }
                    'src_server_api_docsera-runtime-page-delete_ts': {
                        table: 'sys_module'
                        id: 'cc6dadf3e0554cd989a1ea5cc738947c'
                    }
                    'src_server_api_docsera-runtime-page-delete-action_ts': {
                        table: 'sys_module'
                        id: '08f43b579ccb43b99e77dc804e52fed1'
                    }
                    'src_server_api_docsera-runtime-page-lock-acquire_ts': {
                        table: 'sys_module'
                        id: 'bccccfcba4244a409ac9672ab472fd2f'
                    }
                    'src_server_api_docsera-runtime-page-lock-heartbeat_ts': {
                        table: 'sys_module'
                        id: '96b7005b2bef4402bb799a7b42fbfbaf'
                    }
                    'src_server_api_docsera-runtime-page-lock-release_ts': {
                        table: 'sys_module'
                        id: '411ed2abc33342c98883eee1d08a02b9'
                    }
                    'src_server_api_docsera-runtime-page-lock-status_ts': {
                        table: 'sys_module'
                        id: '34628e57ad764459a8b720847e9b8b4f'
                    }
                    'src_server_api_docsera-runtime-page-save_ts': {
                        table: 'sys_module'
                        id: '9f7c1b2a3d4e4f6091a2b3c4d5e6f708'
                    }
                    'src_server_api_docsera-runtime-page-settings-save_ts': {
                        table: 'sys_module'
                        id: '8e8c2844f2c24db0978b72869252c291'
                    }
                    'src_server_api_docsera-runtime-pages_ts': {
                        table: 'sys_module'
                        id: 'f0ae2028924d46f6b6950914d45a15b1'
                    }
                    'src_server_api_docsera-runtime-ping_ts': {
                        table: 'sys_module'
                        id: '0cae8437f1b24d1b8e2e27367ffef695'
                    }
                    'src_server_api_docsera-runtime-workspace-provisioning-status_ts': {
                        table: 'sys_module'
                        id: '7ef70560cca4454b8456cd9e5635225a'
                    }
                    'src_server_api_docsera-runtime-workspaces_ts': {
                        table: 'sys_module'
                        id: 'd9bb2f597b564a9ab74fab37b5e777e4'
                    }
                    'src_server_page-locks_pageEditLockService_ts': {
                        table: 'sys_module'
                        id: '307faf9115f34bb1b6509e5d447d7094'
                    }
                    'src_server_page-locks_serverPageEditLockDomain_ts': {
                        table: 'sys_module'
                        id: '3575ab2ac63d4c77a8c072d2d6f615d8'
                    }
                    'src_server_page-locks_serviceNowPageEditLocks_ts': {
                        table: 'sys_module'
                        id: '63ccc0a121fd4796a894f11359ed0e0a'
                    }
                    src_server_pages_serverEditorDocument_ts: {
                        table: 'sys_module'
                        id: '82c7f7d7d6804f42ba403e468abeb2db'
                    }
                    src_server_pages_serverPageDomain_ts: {
                        table: 'sys_module'
                        id: '8405ade511e74b5783d977e8a5cb0165'
                    }
                    src_server_pages_serviceNowPageCreation_ts: {
                        table: 'sys_module'
                        id: '15f2c4ddfa3d429eaee05457c8553eef'
                    }
                    src_server_pages_serviceNowPageDraftPersistence_ts: {
                        table: 'sys_module'
                        id: '3cbef95d63b7474993a221971a6c9e2b'
                    }
                    src_server_pages_serviceNowPageListing_ts: {
                        table: 'sys_module'
                        id: '6a431e1ba00846fda409ca43a08a23bf'
                    }
                    src_server_pages_serviceNowPagePersistence_ts: {
                        table: 'sys_module'
                        id: '1980fa8f1354457e8cd75c9f3978bc1a'
                    }
                    src_server_pages_serviceNowPageQueries_ts: {
                        table: 'sys_module'
                        id: '812c5633833a463d8b19cb00aa1678e2'
                    }
                    src_server_pages_serviceNowPageRecords_ts: {
                        table: 'sys_module'
                        id: '4d9911302ec443b399935ca3365063db'
                    }
                    src_server_pages_serviceNowPageSettings_ts: {
                        table: 'sys_module'
                        id: '6e50ac65fad94c23bc09b8c678a0e11c'
                    }
                    'src_server_scheduled-scripts_docsera-page-edit-lock-cleanup_js': {
                        table: 'sys_module'
                        id: '7d58605097d6412bb5ec0bf4d57571c5'
                    }
                    src_server_workspaces_serverWorkspaceDomain_ts: {
                        table: 'sys_module'
                        id: '15e7818a1cd7415682575fce3df6368e'
                    }
                    src_server_workspaces_serviceNowWorkspaceCapabilities_ts: {
                        table: 'sys_module'
                        id: 'e95a4d192e1e4d7e9426e30597dd9910'
                    }
                    src_server_workspaces_serviceNowWorkspaceCatalog_ts: {
                        table: 'sys_module'
                        id: 'c671e60c1d4f4133a3b9fbcc8e98104e'
                    }
                    src_server_workspaces_serviceNowWorkspaceProvisioning_ts: {
                        table: 'sys_module'
                        id: 'af3b3203ec254b04a09ca602a42829e7'
                    }
                    src_server_workspaces_serviceNowWorkspaceRecords_ts: {
                        table: 'sys_module'
                        id: '453e4ed122a04dabb3ee142e95de0c8c'
                    }
                    'x_82900_docsera/assets/docsera-default-workspace-icon.png': {
                        table: 'db_image'
                        id: 'e5d2414784714ca5a4ddeae39791462c'
                        deleted: true
                    }
                }
                composite: [
                    {
                        table: 'sys_documentation'
                        id: '0147b7ad729747308a44212b3ce0c41e'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'name'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '0295fc236cc9436aa4b1c5a2caf350d0'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'published_title'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '0409e4aecc534a648b0a268604e7c864'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'verifier_digest'
                        }
                    },
                    {
                        table: 'sys_ui_page'
                        id: '053e258583814373a3f0ef19199023b4'
                        key: {
                            endpoint: 'x_82900_docsera_docsera_sdk_runtime.do'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact'
                        id: '0b944690279d44618ced2280edd7263c'
                        deleted: true
                        key: {
                            name: 'x_82900_docsera_docsera_sdk_runtime.do - BYOUI Files'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '0cb7d10157b54686923d1d67aa42904e'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'last_seen_on'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_choice_set'
                        id: '0ea8ad8d4b9f423ca1cd67aaf83a37dd'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'state'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '0fe8112f6f754ef8b08df169a57421f1'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'requested_by'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: '1036f1724cf246b59b9a9c69935c3e70'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'state'
                            value: 'requested'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '12fddb7581cf4ca48db798719a2d615a'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'active'
                        }
                    },
                    {
                        table: 'sys_db_object'
                        id: '14e1a92bab0641dda3aa21ddab2ab9d3'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '1508adc0ba1f420c82f378b22e608d89'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'draft_title'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '159c08ca62ab4bc29405fc4522c6e0f4'
                        key: {
                            name: 'x_82900_docsera/mountEditorRuntimeSpike'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '1700addcf17d4cc6977685b4be0ef2d3'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'parent_page'
                            language: 'en'
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
                        deleted: false
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
                        table: 'sys_documentation'
                        id: '22d42cfc8d6f4d7297ea437e169ea7c2'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'admin_group_name'
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
                        table: 'sys_dictionary'
                        id: '2607704b7aaa41e79d3d971de5b8d766'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'page'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '29ffcb3bd3b24e57a1ca99032bc82667'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'published_body_text'
                        }
                    },
                    {
                        table: 'ua_table_licensing_config'
                        id: '2a6a87d0335642efbbf0d75159c8cc78'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                        }
                    },
                    {
                        table: 'sys_db_object'
                        id: '2ab06f4b68d244e9b9af5e8cbcb4ee7e'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '2c05c8e108984f66aabb05b2a3ee2f02'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'workspace_status'
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
                        id: '321d5a4693d84162beb643d9dac3372d'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'draft_slug'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '3241a63354b840b6abb971e7951c4f78'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'error_code'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '35305cac601748a2942d4a91e5643190'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'NULL'
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
                        id: '3e0e9f5fa9a849438b39e672fac4404e'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'NULL'
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
                        table: 'sys_dictionary'
                        id: '424c9be761e041fcb652176c77941814'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'published_content_json'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '43d2eafb8f6140659065b261f62a495f'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'publication_state'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '49074d350f4742d1a1dc581518fd6686'
                        deleted: false
                        key: {
                            name: 'x_82900_docsera/main.js.map'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '4ae8d8e43abc4a17b8af0d87c043b0d1'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'icon_label'
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
                        table: 'sys_documentation'
                        id: '4ba9d8f730e9431985e5e5391703a53d'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'page_key'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: '4c145c03bc1a45fe8584d76876fe95e2'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'state'
                            value: 'succeeded'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '4cd76260e339496097be70e1b4bd5e3b'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'error_message'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: '4eb9bf84e89e48a5bf50713fbd2cbe33'
                        deleted: true
                        key: {
                            application_file: '1acd40f0fcb0422e8e047afac7546c60'
                            source_artifact: '0b944690279d44618ced2280edd7263c'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '4f4aaa0296b54cb8baf28fce32c411b8'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'published_content_json'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '4fd139e50b6b4fd99cde9c31d2899c19'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'editor_group_name'
                        }
                    },
                    {
                        table: 'ua_table_licensing_config'
                        id: '519152b0b6d240f7b05a20c4afbdcca8'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '52e81e981b7c40668244510d038e2079'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'draft_body_text'
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
                        table: 'sys_ux_lib_asset'
                        id: '56a7d664df6a442ab56734faddecc0d1'
                        key: {
                            name: 'x_82900_docsera/index'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '57f2fad1d3b24d6b9f22dbdaa4c255ef'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'error_message'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '583cbd9b2e59465989e5d6431f8b404d'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'last_seen_on'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '58c7cd5b8cfa4e178c8ff1660af98e5f'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'draft_revision'
                        }
                    },
                    {
                        table: 'sys_choice_set'
                        id: '59806beb596b4774af32174c0f192def'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'page_width'
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
                        table: 'sys_choice'
                        id: '5f36079293bd4f00a7f707e104eaff1d'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'publication_state'
                            value: 'published_with_unpublished_changes'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: '5f6c9b3730174704815499f36e413265'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'icon_type'
                            value: 'builtin'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: '60f56f710cb24d5f8e8b54625459b370'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'icon_type'
                            value: 'uploaded'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '6b59324fbf2543c790bd275ba921d43e'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'workspace_slug'
                            language: 'en'
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
                        id: '6ce213bd13914b4d9683a9be2869f40c'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'sibling_order'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '6da36cbf7be5400b927e49bb6ed0a2a0'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'NULL'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '6f604986306349ccb54830ffb2ad17d7'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'holder_user'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '6fe76cb454f348d3a729093f6c040054'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'draft_body_text'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '7006ff2125f0454f945ed07d76d75765'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'verifier_digest'
                            language: 'en'
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
                        id: '729b302d85284f6485bae8ae11cb92eb'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'draft_slug_normalized'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '74c5a6df6c884e329d90ba8d57619e75'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'draft_title'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '75e71f99d07a40d3b99f9021171c36d3'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'icon_key'
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
                        table: 'sys_choice'
                        id: '76b81cd15b8e43db8967271139c310b2'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'publication_state'
                            value: 'draft'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '77224652bbd64e918bf8e05e5110f550'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'NULL'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '7740e92a9b424d72a9e272f1a0d2387a'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'draft_content_json'
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
                        table: 'sys_dictionary'
                        id: '7ac73a0fc7c1423a8072f02f78cdce48'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'workspace'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '7b2d22daa3ae4733bfc621793de0144a'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'toc_default_visible'
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
                        table: 'sys_dictionary'
                        id: '7d4235e9e7fc4f2fb5fe52630ae4a6d1'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'workspace_slug'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '7d8b2c5068b14627b937441fcad54271'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'published_slug_normalized'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '80e5dc0a20084a38a58b9c4a89d58e72'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'workspace_group_key'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '82f019173d184e22aaeadd797b01a44d'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'NULL'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '863fd443f057479eb37589a938212047'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'publication_state'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: '889b58a7c4784199a1a0dedf7657ff8b'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'draft_revision'
                            language: 'en'
                        }
                    },
                    {
                        table: 'ua_table_licensing_config'
                        id: '8a600391e5784b78aaf75f058a65b0d2'
                        key: {
                            name: 'x_82900_docsera_page'
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
                        table: 'sys_index'
                        id: '8d8fab0b4e0d4ea7b1d8164b42eb65f8'
                        key: {
                            logical_table_name: 'x_82900_docsera_page_edit_lock'
                            col_name_string: 'page_key'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '8ec1b7d9d77c49ef9a445e1def3eed7c'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'icon_type'
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
                        table: 'sys_choice_set'
                        id: '90cb950e71074bdfb6f1cfc4c3c8085e'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'publication_state'
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
                        table: 'sys_choice'
                        id: '92ec5d5b1a294d699f4e32877bcad910'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'workspace_status'
                            value: 'inactive'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '964e613756434b978e41e7ce97aabf8c'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'acquired_on'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '9843a28d29b74736bc4983a61a5cbf34'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'published_slug_normalized'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: '9ab41a4cef344a6a8d83de33963279be'
                        key: {
                            name: 'x_82900_docsera/PageEditorHostRuntime.js.map'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: '9b38fa8616fb4ba3a44b7bba350f0577'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'admin_group'
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
                        table: 'sys_documentation'
                        id: 'a52e43d635f04cbe9b9ce846664f64ef'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'workspace_status'
                            language: 'en'
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
                        table: 'sys_documentation'
                        id: 'a6f426ea07ed46c39d5d6abc264b1616'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'published_title'
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
                        table: 'sys_dictionary'
                        id: 'a874f4635f4c4883bc41800b022b041d'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'parent_page'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: 'a87fa22eee1743c6b0bc18a27374f7eb'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'page_width'
                            value: 'full'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'a902d09ba1e84dda802a738be1b05f10'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'toc_default_visible'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: 'a976dc6a179b4f77967e9a3c5ebc7ac9'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'page_width'
                            value: 'readable'
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
                        table: 'sys_dictionary'
                        id: 'ad15dc1e736f43398005cba2a11326a5'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'icon_asset_path'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'ad8053aeb6a744c2b18e3b30043928f0'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'published_slug'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: 'ae80f34dcfdf4b2e881bce9943b37083'
                        deleted: true
                        key: {
                            application_file: '053e258583814373a3f0ef19199023b4'
                            source_artifact: '0b944690279d44618ced2280edd7263c'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'aed1d152f285462f8d975965c18f84ef'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'icon_label'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'af510a4fce3546b093838053268cf360'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'workspace_group_key'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'b0577783ef88471f9a82605d57dd3abf'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'icon_key'
                            language: 'en'
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
                        id: 'b2b640255397412c8b355e25c7f5e9b4'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'draft_slug_normalized'
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
                        table: 'sys_dictionary'
                        id: 'b638c03f663c4ee28af91480a2364727'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'name'
                        }
                    },
                    {
                        table: 'sys_index'
                        id: 'b8197bafe3364a82a80a7bf153591ca5'
                        key: {
                            logical_table_name: 'x_82900_docsera_page_edit_lock'
                            col_name_string: 'last_seen_on'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'b8522b150da14f7890a2159465bb1978'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'error_code'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'bbd3d2981bdd487bab5eb374978778d3'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'state'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'bd37cc90120b443b973413ed1afb78a7'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'admin_group_name'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'bd862f568fb746ad9dd6c209222706e2'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'published_slug'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'bdda9a2bea7d45958fabec114c00744b'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'short_description'
                            language: 'en'
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
                        table: 'sys_documentation'
                        id: 'c48ba5dab6a245779e5e96a9630536ee'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'draft_content_json'
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
                        id: 'c5faf915fd87428ba9a427f13b8b2bf8'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'published_body_text'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: 'c612f6111019465b881c960a5c3b2695'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'workspace_status'
                            value: 'active'
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
                        table: 'sys_ux_lib_asset'
                        id: 'c8d1260d361b4d9c98f1ae4036fb04c8'
                        key: {
                            name: 'x_82900_docsera/mountEditorRuntimeSpike.js.map'
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
                        table: 'sys_documentation'
                        id: 'cd0ce918742b4d64a19bce452089622d'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'workspace'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'cd21472059f84b02a6cdb95f0a5aef41'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'workspace'
                            language: 'en'
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
                        table: 'sys_documentation'
                        id: 'cf04971a6f704d77ab59416bca8d482d'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'workspace'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'd13ad2d25b94426da1ba6b2e46338696'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'page_key'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'd25c2ee91fd7406d90c59c0c0ce84981'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'state'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: 'd44057f6bc15434a94b771134c2fc41e'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'publication_state'
                            value: 'published'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: 'd4df6a327f424252890b27737063ee81'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'state'
                            value: 'processing'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'd57d6f31835e4d9bbba33ce7ab49974f'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'holder_user'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'd64c376086924484ad1d42151d0a9e59'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'acquired_on'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'd6db7f88c9eb43e7a0e2c56ca81bb52e'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'workspace'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'd79484f47f284999adf686212e7e04a9'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'editor_group'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'd8a736fb26cf420a95d5e5fbf5f396e7'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'requested_by'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'd9ef8024e8084a608d0df1b73d3c0500'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'icon_asset_path'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'daefe17aebef450288fb748bbaadf38b'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'icon_type'
                            language: 'en'
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
                        table: 'sys_dictionary'
                        id: 'ddb73b8ac9f046519b7df8561f4842f7'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'short_description'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: 'e1482fed27b54655a9044745ba601ad6'
                        key: {
                            name: 'x_82900_docsera/index.js.map'
                        }
                    },
                    {
                        table: 'sys_db_object'
                        id: 'e18605b3c86f47529b48bada5c853a3a'
                        key: {
                            name: 'x_82900_docsera_page'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'e1f74b0895d044ea8b980bb2b7d38645'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'active'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'e21b956dcb054129a49367f9bc217084'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'draft_slug'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'e2b48b89f7ae42b3a55694a85d287c76'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'page'
                            language: 'en'
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
                    {
                        table: 'sys_documentation'
                        id: 'e774a67ef25047e98cef144785d595fd'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'editor_group_name'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'eaef88fbcb964425891fdee2ca4113c2'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'page_width'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'eb4fac02d93943d29513ab341c7216d5'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'editor_group'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'ef0b679aaead4f8187ee10b1e400e883'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'admin_group'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'efbea1aa95674a328bdb4f002ca03a08'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'NULL'
                        }
                    },
                    {
                        table: 'sn_glider_source_artifact_m2m'
                        id: 'f0d51d93a14349e58288c8e9e13381c8'
                        deleted: true
                        key: {
                            application_file: '49074d350f4742d1a1dc581518fd6686'
                            source_artifact: '0b944690279d44618ced2280edd7263c'
                        }
                    },
                    {
                        table: 'sys_dictionary'
                        id: 'f2f6d0571e314139b4d64fa3028b5cdc'
                        key: {
                            name: 'x_82900_docsera_page_edit_lock'
                            element: 'workspace'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'f4e97e36f0f54b25a70c9b5b0932de6a'
                        key: {
                            name: 'x_82900_docsera_page'
                            element: 'sibling_order'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_documentation'
                        id: 'f557b2d3463b4629af91cc27b1988308'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'page_width'
                            language: 'en'
                        }
                    },
                    {
                        table: 'sys_ux_lib_asset'
                        id: 'f8117032c4f74ba98f743499f7472240'
                        key: {
                            name: 'x_82900_docsera/PageEditorHostRuntime'
                        }
                    },
                    {
                        table: 'sys_choice_set'
                        id: 'f959b22d7de54047a6de00b7097fcce4'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'workspace_status'
                        }
                    },
                    {
                        table: 'sys_choice_set'
                        id: 'fe180986de614464a5b62f682a5ef606'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'icon_type'
                        }
                    },
                    {
                        table: 'sys_choice'
                        id: 'ffa2968257d04f7fb80bfdc06b29f854'
                        key: {
                            name: 'x_82900_docsera_workspace_provision_request'
                            element: 'state'
                            value: 'failed'
                        }
                    },
                ]
            }
        }
    }
}
