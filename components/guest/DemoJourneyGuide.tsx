"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import DemoGuideCard from "./DemoGuideCard";
import { DEMO_GUIDE_ACTIONS, DEMO_GUIDE_CHANNEL, DEMO_GUIDE_STEPS, type DemoGuideAction, type DemoGuideModel } from "@/lib/demo-guide";

type Props = {
  lang: string; roomConfirmed: boolean; room: string; departmentOpen: boolean; hasRequest: boolean; latestRequest?:{id:string;status:string}; onFocusRequests:()=>void;
  onFocusRoom: () => void; onOpenDepartment: () => void; onForceSurvey: () => void; onEndStay: () => Promise<boolean>;
};
const STEP_KEY = "gostaya-demo-guide-step-v4";
let memoryStep = 1;
function readStep() {
  try { const n = Number(sessionStorage.getItem(STEP_KEY)); return Number.isInteger(n) && n >= 1 && n <= 10 ? n : memoryStep; } catch { return memoryStep; }
}
function subscribeStep(callback: () => void) {
  window.addEventListener(STEP_KEY, callback);
  return () => window.removeEventListener(STEP_KEY, callback);
}
function isEmbedded() {
  try { return window.parent !== window && window.parent.location.origin === window.location.origin && window.parent.location.pathname === "/demo"; } catch { return false; }
}
const subscribeEnvironment = () => () => {};
const serverStep = () => 1;
const serverEmbedded = () => false;

export default function DemoJourneyGuide({lang,roomConfirmed,room,departmentOpen,hasRequest,latestRequest,onFocusRequests,onFocusRoom,onOpenDepartment,onForceSurvey,onEndStay}:Props) {
  const locale = lang === "bg" || lang === "de" ? lang : "en";
  const steps = DEMO_GUIDE_STEPS[locale];
  const step = useSyncExternalStore(subscribeStep, readStep, serverStep);
  const [hidden,setHidden] = useState(false);
  const embedded = useSyncExternalStore(subscribeEnvironment, isEmbedded, serverEmbedded);
  const [busy,setBusy] = useState(false);
  const [finished,setFinished] = useState(false);
  const [observed,setObserved] = useState({request: false, department: false});
  if ((hasRequest && !observed.request) || (departmentOpen && !observed.department)) {
    setObserved({request: observed.request || hasRequest, department: observed.department || departmentOpen});
  }

  const current = steps[step-1];
  const canContinue = step === 1 ? roomConfirmed && room === "901" : step === 2 ? observed.department : step === 3 ? observed.request : true;
  const model: DemoGuideModel = {step,total:steps.length,...current,canContinue,hidden,finished,busy,request:latestRequest};

  const move = useCallback((next:number) => {
    const safe = Math.max(1,Math.min(steps.length,next));
    memoryStep = safe;
    try { sessionStorage.setItem(STEP_KEY,String(safe)); } catch {}
    window.dispatchEvent(new Event(STEP_KEY));
  },[steps.length]);
  async function act(action:DemoGuideAction) {
    if (action === "guest") onFocusRequests();
    if (action === "room") onFocusRoom();
    if (action === "department") onOpenDepartment();
    if (action === "survey") onForceSurvey();
    if (action === "previous") move(step-1);
    if (action === "next" && canContinue) move(step === 4 && ["in_progress","completed"].includes(latestRequest?.status || "") ? 6 : step+1);
    if (action === "hide") setHidden(true);
    if (action === "show") setHidden(false);
    if (action === "restart") {setFinished(false);setObserved({request: false, department: false});move(1);onFocusRoom();}
    if (["manager","housekeeping","reception"].includes(action)) {
      window.open(`/staff/demo/${action}`,"_blank","noopener,noreferrer");
    }
    if (action === "checkout" && !busy) {
      setBusy(true);
      const ok = await onEndStay().catch(()=>false);
      setBusy(false);
      if (ok) {setFinished(true);try {sessionStorage.removeItem(STEP_KEY);} catch {}}
    }
  }

  useEffect(()=>{
    if (!latestRequest?.id) return;
    if (step >= 2 && step <= 3) move(4);
    else if (latestRequest.status === "completed" && step >= 4 && step <= 5) move(6);
  },[latestRequest?.id,latestRequest?.status,step,move]);

  useEffect(()=>{
    if (!embedded) return;
    window.parent.postMessage({channel:DEMO_GUIDE_CHANNEL,type:"state",model},window.location.origin);
    function receive(event:MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.channel !== DEMO_GUIDE_CHANNEL) return;
      if (event.data.type === "reveal-request") onFocusRequests();
      if (event.data.type === "sync") window.parent.postMessage({channel:DEMO_GUIDE_CHANNEL,type:"state",model},window.location.origin);
      if (event.data.type === "navigate" && Number.isInteger(event.data.step) && event.data.step >= 1 && event.data.step <= step) move(event.data.step);
      if (event.data.type === "action" && DEMO_GUIDE_ACTIONS.includes(event.data.action)) void act(event.data.action);
    }
    window.addEventListener("message",receive);
    return ()=>window.removeEventListener("message",receive);
  });

  if (embedded) return null;
  return <div className="px-4 pb-3"><DemoGuideCard model={model} lang={locale} onAction={action=>void act(action)}/></div>;
}
