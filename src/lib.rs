//! Docs: documents people write together, over Drive's documents edited live (`.fdoc` files).
//!
//! * Templates (`templates`): what a new document starts from, as Markdown. People pick one on
//!   Docs' home; AI agents run New Document on it.
//! * Its own interface (`ui/`, at `/docs/` in Drive's family, Workspace): a home for documents
//!   (recent, shared with you, starred, all) with search by what they say, and the editor
//!   everyone types in at once (`/docs/d/{file}`). Built into `ui/dist` and embedded as [`UI`].
//!
//! The documents themselves are Drive's: who may open them, versions, trash and sharing, and the
//! actions people and agents use on them (`create_document`, `read_document`,
//! `append_to_document` on their Drive Space). See `packages/docs/README.md`.

mod templates;

use ferrum_domain::reports::ReportSource;
use ferrum_kernel::{HookRegistry, Kernel, Result};
use std::sync::Arc;

include!(concat!(env!("OUT_DIR"), "/packages.rs"));
include!(concat!(env!("OUT_DIR"), "/ui.rs"));

/// This app's manifest (`app.yaml`).
pub const MANIFEST: &str = include_str!("../app.yaml");

/// This app's metadata packages, embedded at build time.
pub fn packages() -> std::result::Result<Vec<ferrum_meta::Package>, ferrum_meta::MetaError> {
    ferrum_meta::catalog::load_embedded(EMBEDDED)
}

/// Registers this app's document hooks.
pub fn register(hooks: &mut HookRegistry) {
    hooks.register("DocsTemplate", Arc::new(templates::TemplateHook));
}

/// This app's reports: none.
pub fn reports() -> Vec<Arc<dyn ReportSource>> {
    Vec::new()
}

/// Periodic upkeep: none (Drive keeps the documents).
pub async fn maintenance(_k: &Kernel) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packages_load_with_the_platform_and_drive() {
        let mut all = ferrum_domain::packages().expect("platform packages");
        all.extend(ferrum_app_drive::packages().expect("drive packages"));
        all.extend(packages().expect("docs packages"));
        let catalog = ferrum_meta::Catalog::from_packages(all).expect("catalog");
        assert!(catalog.package("docs").is_some());
        assert!(MANIFEST.contains("packages: [docs]") && MANIFEST.contains("drive: \">=0.7\""));
    }

    #[test]
    fn the_interface_is_a_release_the_platform_takes() {
        let m = ferrum_apps::AppManifest::parse(MANIFEST).expect("app.yaml");
        assert_eq!(m.routes(), vec![("docs".to_string(), vec![])]);
        let files = UI.iter().map(|(p, b)| (p.to_string(), b.to_vec())).collect();
        let ui = ferrum_apps::ui::prepare("docs", files).expect("ui/dist is an interface release");
        assert!(UI.iter().any(|(p, _)| *p == "index.html") && !UI.iter().any(|(p, _)| p.starts_with('.')), "{}", ui.digest);
    }
}
