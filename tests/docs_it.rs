//! Docs against a real PostgreSQL (`FERRUM_DOCS_TEST_DATABASE_URL`, default
//! `postgres://ferrum:ferrum@localhost:5432/ferrum_docs_test`; the database is reset), with Drive:
//! the templates a workspace starts with, documents made from them (named, in a folder, with the
//! caller's access), templates made from documents (read with the creator's access), and who may
//! do what.

use async_trait::async_trait;
use ferrum_kernel::query::Filter;
use ferrum_kernel::tenant::NewTenant;
use ferrum_kernel::{Ctx, Db, DbConfig, Doc, Error, HookRegistry, Kernel, KernelSettings, ListQuery};
use ferrum_meta::Catalog;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

/// The platform's object storage, in memory.
#[derive(Default)]
struct MemStore(Mutex<HashMap<String, Vec<u8>>>);

#[async_trait]
impl ferrum_kernel::files::FileStore for MemStore {
    async fn put(&self, key: &str, data: &[u8]) -> ferrum_kernel::Result<()> {
        self.0.lock().unwrap().insert(key.to_string(), data.to_vec());
        Ok(())
    }
    async fn get(&self, key: &str) -> ferrum_kernel::Result<Vec<u8>> {
        self.0.lock().unwrap().get(key).cloned().ok_or_else(|| Error::NotFound("object".into()))
    }
    async fn delete(&self, key: &str) -> ferrum_kernel::Result<()> {
        self.0.lock().unwrap().remove(key);
        Ok(())
    }
}

fn obj(v: Value) -> Doc {
    v.as_object().cloned().unwrap()
}

fn uid(v: &Value) -> Uuid {
    v["id"].as_str().unwrap_or_else(|| panic!("no id in {v}")).parse().unwrap()
}

struct T {
    k: Arc<Kernel>,
    tenant: Uuid,
    admin: Ctx,
}

impl T {
    async fn person(&self, email: &str, roles: &[&str]) -> Ctx {
        let roles: Vec<String> = roles.iter().map(|r| r.to_string()).collect();
        let id = self.k.create_user(&self.admin, email, &email.replace("@acme.test", ""), Some("Correct-Horse-9"), &roles, false).await.expect("user");
        self.k.load_ctx(self.tenant, id, None, "it".into()).await.expect("ctx")
    }

    /// The person's Drive space, as the web app opens it.
    async fn space(&self, ctx: &Ctx) -> Uuid {
        let site = self.k.hooks.site("drive").unwrap().clone();
        let req = ferrum_kernel::SiteRequest {
            tenant: self.tenant,
            user: Some(ctx.clone()),
            method: "GET".into(),
            path: "space".into(),
            query: Default::default(),
            headers: Default::default(),
            body: Vec::new(),
            client_ip: "127.0.0.1".into(),
        };
        let res = site.handle(&self.k, req).await.expect("space");
        serde_json::from_slice::<Value>(&res.body).unwrap()["id"].as_str().unwrap().parse().unwrap()
    }

    async fn drive(&self, ctx: &Ctx, action: &str, params: Value) -> ferrum_kernel::Result<Value> {
        let space = self.space(ctx).await;
        self.k.run_action(ctx, "DriveSpace", space, action, params).await
    }

    async fn template(&self, name: &str) -> Uuid {
        let q = ListQuery { filters: vec![Filter::eq("name", name)], ..Default::default() };
        let rows = self.k.list(&self.admin, "DocsTemplate", &q).await.unwrap().rows;
        uid(&Value::Object(rows.first().unwrap_or_else(|| panic!("no template {name}")).clone()))
    }
}

#[test]
fn docs_end_to_end() {
    // Same runtime shape as the server: unoptimized async hook chains need more than 2 MiB.
    let rt = tokio::runtime::Builder::new_multi_thread().enable_all().thread_stack_size(16 << 20).build().unwrap();
    rt.block_on(async { tokio::spawn(scenario()).await.unwrap() });
}

async fn scenario() {
    let url = std::env::var("FERRUM_DOCS_TEST_DATABASE_URL").unwrap_or_else(|_| "postgres://ferrum:ferrum@localhost:5432/ferrum_docs_test".into());
    let db = Db::connect(DbConfig { url, max_connections: 20, ..Default::default() }).await.expect("connect");
    sqlx::raw_sql("drop schema if exists public cascade; create schema public;").execute(&db.pool).await.expect("reset");
    let mut packages = ferrum_domain::packages().expect("platform packages");
    packages.extend(ferrum_app_drive::packages().expect("drive packages"));
    packages.extend(ferrum_app_docs::packages().expect("docs packages"));
    let catalog = Catalog::from_packages(packages).expect("catalog");
    let mut hooks = HookRegistry::default();
    ferrum_domain::register(&mut hooks);
    ferrum_app_drive::register(&mut hooks);
    ferrum_app_docs::register(&mut hooks);
    let k = Kernel::boot(db, catalog, hooks, KernelSettings::default(), None).await.expect("boot");
    k.set_file_store(Arc::new(MemStore::default()));
    ferrum_domain::maintenance(&k).await.expect("partitions");
    let tenant = k
        .create_tenant(NewTenant {
            slug: "acme".into(),
            name: "Acme".into(),
            admin_email: "admin@acme.test".into(),
            admin_password: "Correct-Horse-9".into(),
            admin_name: None,
            packages: vec!["drive".into(), "docs".into()],
            settings: None,
        })
        .await
        .expect("tenant");
    let session = k.login("acme", "admin@acme.test", "Correct-Horse-9").await.expect("login");
    let admin = k.load_ctx(tenant, session.user, Some(session.token_version), "it".into()).await.expect("ctx");
    let t = T { k: k.clone(), tenant, admin };
    let alice = t.person("alice@acme.test", &["Docs User"]).await;
    let bob = t.person("bob@acme.test", &["Docs User"]).await;
    let carol = t.person("carol@acme.test", &["Docs User", "Docs Manager"]).await;
    let dave = t.person("dave@acme.test", &[]).await;

    // ── the templates every workspace starts with, in gallery order ──
    let q = ListQuery { sort: Some("sort_order asc".into()), ..Default::default() };
    let listed: Vec<String> = k.list(&alice, "DocsTemplate", &q).await.unwrap().rows.iter().map(|r| r["name"].as_str().unwrap().to_string()).collect();
    assert_eq!(listed, ["Meeting notes", "Project brief", "Weekly update", "Decision record", "Product requirements", "One-on-one"]);
    assert_eq!(k.list(&dave, "DocsTemplate", &q).await.unwrap_err().code(), "forbidden", "no Docs role");

    // ── a document from a template: named after it or as asked, numbered on a clash ──
    let notes = t.template("Meeting notes").await;
    let made = k.run_action(&alice, "DocsTemplate", notes, "create_document", json!({"title": "Standup, 30 October"})).await.unwrap();
    assert_eq!((made["name"].as_str(), made["content_type"].as_str()), (Some("Standup, 30 October.fdoc"), Some("application/vnd.ferrum.doc")));
    let standup = uid(&made);
    let read = t.drive(&alice, "read_document", json!({"file": standup})).await.unwrap();
    let md = read["content"].as_str().unwrap();
    assert!(md.starts_with("# Meeting notes\n\n**Date:** *when* · **Attendees:** *who*\n\n## Agenda\n\n1. *Topic*\n2. *Topic*"), "{md}");
    assert!(md.contains("- [ ] *Task*, *owner*, by *date*"), "{md}");
    let first = k.run_action(&alice, "DocsTemplate", notes, "create_document", json!({})).await.unwrap();
    let second = k.run_action(&alice, "DocsTemplate", notes, "create_document", json!({"title": "  "})).await.unwrap();
    assert_eq!((first["name"].as_str(), second["name"].as_str()), (Some("Meeting notes.fdoc"), Some("Meeting notes (2).fdoc")));
    // In a folder of hers; not in someone else's.
    let projects = t.drive(&alice, "create_folder", json!({"name": "Projects"})).await.unwrap();
    let brief = t.template("Project brief").await;
    let placed = k.run_action(&alice, "DocsTemplate", brief, "create_document", json!({"folder": uid(&projects)})).await.unwrap();
    assert_eq!(placed["parent"], projects["id"]);
    let e = k.run_action(&bob, "DocsTemplate", brief, "create_document", json!({"folder": uid(&projects)})).await.unwrap_err();
    assert_eq!(e.to_string(), "Drive item not found", "bob may not write into alice's folder");
    assert_eq!(k.run_action(&dave, "DocsTemplate", brief, "create_document", json!({})).await.unwrap_err().code(), "forbidden");
    // Found by what it says, in the documents-only views.
    let found = t.drive(&alice, "search", json!({"query": "Attendees", "live": true})).await.unwrap();
    assert!(found["items"].as_array().unwrap().iter().any(|i| uid(i) == standup), "{found}");

    // ── a template from a document: its content, read with the creator's access ──
    let e = k.insert(&carol, "DocsTemplate", obj(json!({"name": "Standup", "source_document": standup.to_string()}))).await.unwrap_err();
    assert_eq!(e.to_string(), "Drive item not found", "carol may not read alice's document yet");
    t.drive(&alice, "share", json!({"item": standup, "email": "carol@acme.test", "permission": "View"})).await.unwrap();
    t.drive(&alice, "append_to_document", json!({"file": standup, "markdown": "## Blockers\n\n- *None so far*"})).await.unwrap();
    let made = k.insert(&carol, "DocsTemplate", obj(json!({"name": "Standup", "category": "Meetings", "source_document": standup.to_string()}))).await.unwrap();
    let content = made["content"].as_str().unwrap();
    assert!(content.starts_with("# Meeting notes") && content.ends_with("## Blockers\n\n- *None so far*\n"), "as alice left it: {content}");
    let from_doc = uid(&Value::Object(made));
    let copy = k.run_action(&bob, "DocsTemplate", from_doc, "create_document", json!({})).await.unwrap();
    assert_eq!(copy["name"], "Standup.fdoc");
    let e = k.insert(&carol, "DocsTemplate", obj(json!({"name": "Empty"}))).await.unwrap_err();
    assert!(format!("{e:?}").contains("is required, or a source document"), "{e:?}");
    let e = k.insert(&carol, "DocsTemplate", obj(json!({"name": "Bad", "source_document": "not-an-id"}))).await.unwrap_err();
    assert!(format!("{e:?}").contains("not a document's id"), "{e:?}");
    assert_eq!(k.insert(&alice, "DocsTemplate", obj(json!({"name": "Mine", "content": "# Mine"}))).await.unwrap_err().code(), "forbidden", "only managers");

    // ── a retired template makes no more documents ──
    let mut off = Doc::new();
    off.insert("is_active".into(), json!(false));
    k.update(&carol, "DocsTemplate", from_doc, off, None).await.unwrap();
    let e = k.run_action(&bob, "DocsTemplate", from_doc, "create_document", json!({})).await.unwrap_err();
    assert!(e.to_string().contains("no longer in use"), "{e}");
}
