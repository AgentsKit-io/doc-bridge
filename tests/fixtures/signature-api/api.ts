export interface Thing {
  name: string
  enabled?: boolean
}
export function createThing(name: string): Thing {
  return { name }
}
export class ThingStore {
  constructor(public name: string) {}
  create(enabled?: boolean): Thing { return { name: this.name, enabled } }
}
export const describeThing = (thing: Thing): string => thing.name
