(ns minpaku.frontend.app
  "Client entry point for the minpaku appview frontend.

  Faithful port of the previous Svelte 5 + Vite scaffold (`App.svelte`): a
  single static screen with a heading and a one-line status message — no
  listing/booking/payment UI exists here (that decision core lives in
  `kotoba/src/` and is untouched by this migration). The stack is now
  ClojureScript compiled by shadow-cljs, reagent for the view, re-frame for
  state, and jp-go-dds (デジタル庁デザインシステム) hiccup components instead
  of hand-written markup + Tailwind.

  Handler/subscriber functions are named top-level defns rather than inline
  fns passed to `reg-event-db`/`reg-sub` so `app-test.cljs` can call them
  directly without going through re-frame's global app-db/registry."
  (:require [reagent.dom :as rdom]
            [re-frame.core :as rf]
            [jp-go-dds.core :as dds]))

;; -- db -----------------------------------------------------------------

(def default-db
  "Initial state. `:app/ready?` flips once `main` has actually mounted the
  view — it is the one piece of real (if trivial) state this scaffold has,
  standing in for whatever `App.svelte`'s implicit \"the component mounted\"
  moment was."
  {:app/name "minpaku-frontend-mp7k9x2w"
   :app/tagline "ClojureScript (reagent + re-frame) scaffold after the Svelte/Vite migration."
   :app/ready? false})

(defn initialize-db-handler
  [_db _event]
  default-db)

(defn mounted-handler
  [db _event]
  (assoc db :app/ready? true))

(defn name-sub [db _query] (:app/name db))
(defn tagline-sub [db _query] (:app/tagline db))
(defn ready-sub [db _query] (:app/ready? db))

(rf/reg-event-db :initialize-db initialize-db-handler)
(rf/reg-event-db :app/mounted mounted-handler)

(rf/reg-sub :app/name name-sub)
(rf/reg-sub :app/tagline tagline-sub)
(rf/reg-sub :app/ready? ready-sub)

;; -- view -----------------------------------------------------------------

(defn root-view []
  (let [app-name @(rf/subscribe [:app/name])
        tagline  @(rf/subscribe [:app/tagline])]
    (dds/container
     (dds/heading 1 app-name)
     [:p tagline])))

;; -- mount ------------------------------------------------------------------

(defn- inject-ext-css!
  "jp-go-dds's `container`/`stack`/`section`/... layout classes (`dds-ext-*`)
  are not part of the vendored `public/css/dds.css` — that file only carries
  the upstream DADS component CSS. `ext-css` is a pure function of data
  (`jp-go-dds.core/ext-rules` + `ext-media` run through `css.core/css`), so
  it is computed and injected once here instead of hand-copying a second
  stylesheet asset."
  []
  (let [style (.createElement js/document "style")]
    (set! (.-textContent style) dds/ext-css)
    (.appendChild (.-head js/document) style)))

(defn mount-root []
  (rdom/render [root-view] (.getElementById js/document "app")))

(defn main
  "shadow-cljs `:init-fn`."
  []
  (rf/dispatch-sync [:initialize-db])
  (inject-ext-css!)
  (mount-root)
  (rf/dispatch [:app/mounted]))
