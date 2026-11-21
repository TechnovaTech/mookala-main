import { NextRequest } from 'next/server';
import { createResource, listResource } from '@/lib/resource';
import '@/lib/resources/hooks';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { resource: string } }) {
  return listResource(request, params.resource);
}

export async function POST(request: NextRequest, { params }: { params: { resource: string } }) {
  return createResource(request, params.resource);
}
