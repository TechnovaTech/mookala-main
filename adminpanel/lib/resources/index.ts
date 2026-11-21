import type { ResourceDef } from '../resource-types';
import { supportResources } from './support';
import { learningResources } from './learning';
import { wishesResources } from './wishes';
import { advertisingResources } from './advertising';
import { membershipsResources } from './memberships';
import { marketingResources } from './marketing';
import { communicationsResources } from './communications';
import { legalResources } from './legal';
import { fraudResources } from './fraud';
import { systemResources } from './system';
import { financeResources } from './finance';
import { catalogueResources } from './catalogue';
import { artistsResources } from './artists';
import { reportsResources } from './reports';

/**
 * Registry of every generic admin resource. Each module file exports an array
 * of definitions. A resource is available at /api/admin/r/<name> and to the
 * ResourcePage component as soon as its definition is in one of these arrays.
 *
 * These files are also bundled for the browser, so they must contain plain
 * data only. Server-side behaviour goes in the matching <module>.hooks.ts.
 */
const ALL: ResourceDef[] = [
  ...supportResources,
  ...learningResources,
  ...wishesResources,
  ...advertisingResources,
  ...membershipsResources,
  ...marketingResources,
  ...communicationsResources,
  ...legalResources,
  ...fraudResources,
  ...systemResources,
  ...financeResources,
  ...catalogueResources,
  ...artistsResources,
  ...reportsResources,
];

const BY_NAME = new Map(ALL.map((def) => [def.name, def]));

export function getResource(name: string): ResourceDef | undefined {
  return BY_NAME.get(name);
}

export function allResources(): ResourceDef[] {
  return ALL;
}
