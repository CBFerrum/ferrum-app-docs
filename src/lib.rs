//! Docs: documents people write together, over Drive's documents edited live (`.fdoc` files).
//!
//! * Templates (`templates`): what a new document starts from, as Markdown. People pick one in
//!   the web app's Docs page; AI agents run New Document on it.
//! * In the web app, a home for documents (recent, shared with you, starred, all), with search by
//!   what they say.
//!
//! The documents themselves are Drive's: who may open them, versions, trash and sharing, and the
//! actions people and agents use on them (`create_document`, `read_document`,
//! `append_to_document` on their Drive Space). See `packages/docs/README.md`.

mod templates;

use ferrum_domain::reports::ReportSource;
use ferrum_kernel::{HookRegistry, Kernel, Result};
use std::sync::Arc;

include!(concat!(env!("OUT_DIR"), "/packages.rs"));

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
}
