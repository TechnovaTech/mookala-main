import { NextRequest } from 'next/server';
import {
  deleteResourceItem,
  getResourceItem,
  patchResourceItem,
  updateResourceItem,
} from '@/lib/resource';
import '@/lib/resources/hooks';

export const dynamic = 'force-dynamic';

type Ctx = { params: { resource: string; id: string } };

export async function GET(request: NextRequest, { params }: Ctx) {
  return getResourceItem(request, params.resource, params.id);
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  return updateResourceItem(request, params.resource, params.id);
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  return patchResourceItem(request, params.resource, params.id);
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  return deleteResourceItem(request, params.resource, params.id);
}
