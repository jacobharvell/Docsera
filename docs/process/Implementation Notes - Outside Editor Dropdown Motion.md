# Outside-editor dropdown motion

Recent Workspaces, Account, Changes Center, and Page Actions retain their last presentation for a 130 ms exit. Their logical open state continues to control dismissal, focus, positioning listeners, and commands; retained surfaces are inert and hidden from accessibility. Changes Center and Page Actions keep their last resolved portal coordinates during exit. Reduced motion removes retained surfaces immediately. Editor menus do not use this lifecycle.
