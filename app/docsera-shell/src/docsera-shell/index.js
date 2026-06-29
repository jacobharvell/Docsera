import {
	createCustomElement
} from '@servicenow/ui-core';
import snabbdom from '@servicenow/ui-renderer-snabbdom';
import styles from './styles.scss';

const navItems = [
	{
		id: 'overview',
		label: 'Overview',
		note: 'Shell scaffold'
	},
	{
		id: 'workspaces',
		label: 'Workspaces',
		note: 'Next task'
	},
	{
		id: 'access',
		label: 'Access',
		note: 'Pending model'
	}
];

const sections = {
	overview: {
		title: 'Docsera app shell is mounted',
		lede: 'This is the forward-looking product surface. It establishes the layout, token layer, and runtime entry point for future workspace, page, and editor work.',
		status: [
			{
				label: 'Surface',
				value: 'Product app shell'
			},
			{
				label: 'Persistence',
				value: 'Not implemented'
			},
			{
				label: 'PoC boundary',
				value: 'Kept separate'
			}
		]
	},
	workspaces: {
		title: 'Workspace shell placeholder',
		lede: 'Workspace creation, provisioning, and persistence are intentionally deferred to the next implementation task.',
		status: [
			{
				label: 'Records',
				value: 'No table integration'
			},
			{
				label: 'Groups',
				value: 'No provisioning yet'
			},
			{
				label: 'Routing',
				value: 'Shell only'
			}
		]
	},
	access: {
		title: 'Access scaffold placeholder',
		lede: 'Permission checks, role branching, and record-level ownership are not introduced at this stage.',
		status: [
			{
				label: 'ACLs',
				value: 'Not added'
			},
			{
				label: 'Roles',
				value: 'Deferred'
			},
			{
				label: 'Checks',
				value: 'Pattern pending'
			}
		]
	}
};

const view = (state, {updateState}) => {
	const current = state.section && sections[state.section] ? state.section : 'overview';
	const section = sections[current];

	return (
		<div className="docsera-shell">
			<header className="docsera-shell__header">
				<div className="docsera-shell__brand">
					<span className="docsera-shell__brand-mark" aria-hidden="true">D</span>
					<span>Docsera</span>
				</div>
				<div className="docsera-shell__badge">App shell</div>
			</header>

			<div className="docsera-shell__frame">
				<aside className="docsera-shell__rail" aria-label="Docsera navigation">
					<p className="docsera-shell__rail-title">Shell sections</p>
					<nav className="docsera-shell__nav">
						{navItems.map(item => (
							<button
								key={item.id}
								type="button"
								className={`docsera-shell__nav-item ${item.id === current ? 'is-active' : ''}`}
								on-click={() => updateState({section: item.id})}
							>
								<span className="docsera-shell__nav-label">{item.label}</span>
								<span className="docsera-shell__nav-note">{item.note}</span>
							</button>
						))}
					</nav>
				</aside>

				<main className="docsera-shell__panel">
					<div className="docsera-shell__panel-grid">
						<h1 className="docsera-shell__headline">{section.title}</h1>
						<p className="docsera-shell__lede">{section.lede}</p>

						<div className="docsera-shell__status-grid">
							{section.status.map(item => (
								<section key={item.label} className="docsera-shell__status-card">
									<span className="docsera-shell__status-label">{item.label}</span>
									<div className="docsera-shell__status-value">{item.value}</div>
								</section>
							))}
						</div>

						<section className="docsera-shell__surface" aria-label="Docsera shell surface">
							<div className="docsera-shell__surface-meta">
								<span className="docsera-shell__chip">Scoped app</span>
								<span className="docsera-shell__chip">UI Builder ready</span>
								<span className="docsera-shell__chip">Token layer stubbed</span>
							</div>
							<h2>Future feature work lands here</h2>
							<p>
								The shell intentionally stops short of workspace creation, page trees, editor mount behavior, persistence,
								publishing, or access enforcement. Those behaviors will be layered in after the data model task.
							</p>
						</section>
					</div>
				</main>
			</div>
		</div>
	);
};

createCustomElement('x-82900-docsera-shell', {
	renderer: {type: snabbdom},
	setInitialState() {
		return {
			section: 'overview'
		};
	},
	view,
	styles
});
