(ns minpaku.frontend.app-test
  (:require [cljs.test :refer [deftest is testing]]
            [re-frame.core :as rf]
            [re-frame.db :as rf-db]
            [minpaku.frontend.app :as app]))

;; -- pure handler/sub tests -------------------------------------------------
;; These call the named handler/sub functions directly, bypassing re-frame's
;; global registry entirely, so they are deterministic regardless of test
;; order or whatever else in the suite has dispatched into the shared app-db.

(deftest initialize-db-handler-test
  (testing "initialize-db-handler returns the scaffold's default state"
    (let [db (app/initialize-db-handler {:some "stale state"} [:initialize-db])]
      (is (= "minpaku-frontend-mp7k9x2w" (:app/name db)))
      (is (= "ClojureScript (reagent + re-frame) scaffold after the Svelte/Vite migration."
             (:app/tagline db)))
      (is (false? (:app/ready? db))
          "freshly initialized db is not yet marked ready — that only
           happens after the view has actually mounted"))))

(deftest mounted-handler-test
  (testing "mounted-handler flips :app/ready? without touching other keys"
    (let [db (app/mounted-handler app/default-db [:app/mounted])]
      (is (true? (:app/ready? db)))
      (is (= (:app/name app/default-db) (:app/name db)))
      (is (= (:app/tagline app/default-db) (:app/tagline db))))))

(deftest subs-test
  (testing "name-sub / tagline-sub / ready-sub read the expected keys"
    (let [db (app/mounted-handler app/default-db [:app/mounted])]
      (is (= (:app/name db) (app/name-sub db nil)))
      (is (= (:app/tagline db) (app/tagline-sub db nil)))
      (is (true? (app/ready-sub db nil))))))

;; -- integration test: the handlers/subs really are wired into re-frame -----

(deftest re-frame-wiring-test
  (testing "dispatch-sync + subscribe round-trip through the real re-frame db"
    (reset! rf-db/app-db {})
    (rf/dispatch-sync [:initialize-db])
    (is (= "minpaku-frontend-mp7k9x2w" @(rf/subscribe [:app/name])))
    (is (false? @(rf/subscribe [:app/ready?])))
    (rf/dispatch-sync [:app/mounted])
    (is (true? @(rf/subscribe [:app/ready?])))))
