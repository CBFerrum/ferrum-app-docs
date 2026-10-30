//! Templates: what a new document starts from (Markdown). `create_document` on a template makes a
//! Drive document from it for the caller, in their space or a folder they may edit. A template
//! made with a `source_document` and no content copies that document's content, read with the
//! creator's own access. Everything goes through Drive's own doors, as the caller.

use async_trait::async_trait;
use ferrum_kernel::{Doc, DocHook, Error, HookCtx, Result, SiteRequest};
use serde_json::{Map, Value, json};
use uuid::Uuid;

pub struct TemplateHook;

fn text<'a>(doc: &'a Doc, key: &str) -> Option<&'a str> {
    doc.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty())
}

/// The caller's Drive space (made on first use), through Drive's endpoint for it.
async fn space(hc: &HookCtx<'_>) -> Result<Uuid> {
    let site = hc.kernel.hooks.site("drive").cloned().ok_or_else(|| Error::Unavailable("Docs needs Drive".into()))?;
    let req = SiteRequest {
        tenant: hc.ctx.tenant,
        user: Some(hc.ctx.clone()),
        method: "GET".into(),
        path: "space".into(),
        query: Map::new(),
        headers: Map::new(),
        body: Vec::new(),
        client_ip: "127.0.0.1".into(),
    };
    let res = site.handle(hc.kernel, req).await?;
    let v: Value = serde_json::from_slice(&res.body).map_err(|e| Error::internal(format!("Drive's space: {e}")))?;
    v["id"].as_str().and_then(|s| s.parse().ok()).ok_or_else(|| Error::internal("Drive gave no space"))
}

#[async_trait]
impl DocHook for TemplateHook {
    async fn before_validate(&self, hc: &mut HookCtx<'_>, doc: &mut Doc) -> Result<()> {
        let new = !doc.contains_key("created_at");
        if new
            && text(doc, "content").is_none()
            && let Some(source) = text(doc, "source_document")
        {
            let file: Uuid = source.parse().map_err(|_| Error::field("source_document", "is not a document's id"))?;
            let space = space(hc).await?;
            let read = hc.kernel.run_action(hc.ctx, "DriveSpace", space, "read_document", json!({"file": file})).await?;
            doc.insert("content".into(), read["content"].clone());
            doc.insert("source_document".into(), json!(file));
        }
        if text(doc, "content").is_none() {
            return Err(Error::field("content", "is required, or a source document to take it from"));
        }
        Ok(())
    }

    async fn action(&self, hc: &mut HookCtx<'_>, name: &str, doc: &Doc, params: &Value) -> Result<Option<Value>> {
        if name != "create_document" {
            return Ok(None);
        }
        if matches!(doc.get("is_active"), Some(Value::Bool(false))) || doc.get("is_active").and_then(Value::as_i64) == Some(0) {
            return Err(Error::invalid("this template is no longer in use"));
        }
        let title = params.get("title").and_then(Value::as_str).map(str::trim).filter(|t| !t.is_empty()).or_else(|| text(doc, "name")).unwrap_or("Untitled");
        let mut create = json!({"title": title, "markdown": text(doc, "content").unwrap_or_default()});
        if let Some(folder) = params.get("folder").filter(|f| !f.is_null() && f.as_str() != Some("")) {
            create["folder"] = folder.clone();
        }
        let space = space(hc).await?;
        Ok(Some(hc.kernel.run_action(hc.ctx, "DriveSpace", space, "create_document", create).await?))
    }
}
