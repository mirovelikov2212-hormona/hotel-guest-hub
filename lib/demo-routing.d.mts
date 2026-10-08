export function validDemoTimeZone(value:unknown):string|null;
export function browserDemoTimeZone():string;
export function demoRoutingApplies(slug:string,isTest:unknown,room:unknown):boolean;
export function demoDepartmentWorking(timeZone:string,now?:Date):boolean;
export function demoRequestReady(request:{serviceTime?:string;createdAtIso:string},timeZone:string,now?:Date):boolean;
