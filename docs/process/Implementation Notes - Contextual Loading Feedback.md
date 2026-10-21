# Contextual Loading Feedback

Workspace/page-list loading and editor initialization use independent delayed feedback. The editor host remains mounted while it initializes; its decorative placeholder is a sibling of the destination reveal surface so pending opacity cannot hide the feedback. The destination surface is hidden while that placeholder is shown, and the placeholder is removed when initialization completes before the existing reveal proceeds. Placeholder geometry uses the document surface lane and does not participate in editor interactions.
