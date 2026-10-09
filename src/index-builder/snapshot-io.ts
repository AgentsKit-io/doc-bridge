import type { DiscoverySnapshotV1 } from '../schemas/knowledge.js'
import type { ArtifactIOV1, StorageRequest } from '../storage/contract.js'
import { readJsonArtifact, writeJsonArtifact } from './artifact-io.js'
import { parseDiscoverySnapshot } from '../validate.js'

const validateSnapshot = parseDiscoverySnapshot
export const readStoredSnapshot = (io: ArtifactIOV1, request: StorageRequest) => readJsonArtifact(io, request, { kind: 'snapshot', name: 'snapshot' }, 'DiscoverySnapshotV1', validateSnapshot)
export const writeStoredSnapshot = (io: ArtifactIOV1, request: StorageRequest, snapshot: DiscoverySnapshotV1, expectedPreviousByteHash: string | null) => writeJsonArtifact(io, request, { kind: 'snapshot', name: 'snapshot' }, 'DiscoverySnapshotV1', validateSnapshot(snapshot), expectedPreviousByteHash)
