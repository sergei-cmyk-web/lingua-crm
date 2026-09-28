import { prisma } from '../../lib/prisma'
import { emitToRoom } from '../../socket/handlers'
import { triggerAutomation } from '../automation/engine'

/**
 * Системный перенос сделки в этап (платёжный вебхук, автоматизации).
 * В отличие от PATCH /deals/:id/stage НЕ проверяет обязательные поля и причину потери —
 * системное действие не должно блокироваться; для won/lost проставляет closedAt.
 */
export async function applyStageMove(
  dealId: string,
  targetStageId: string,
  opts: { userId?: string | null; activityType?: string; hop?: number } = {}
) {
  const [deal, targetStage] = await Promise.all([
    prisma.deal.findUnique({ where: { id: dealId } }),
    prisma.stage.findUnique({ where: { id: targetStageId } }),
  ])
  if (!deal || !targetStage) return null
  if (deal.stageId === targetStage.id) return deal

  const closureData =
    targetStage.type === 'lost' || targetStage.type === 'won'
      ? { closedAt: new Date() }
      : { closedAt: null, lostReasonId: null, lostComment: null }

  const prevStageId = deal.stageId
  const prevPipelineId = deal.pipelineId

  const updated = await prisma.deal.update({
    where: { id: dealId },
    data: { stageId: targetStage.id, pipelineId: targetStage.pipelineId, stageEnteredAt: new Date(), ...closureData },
  })

  await prisma.activity.create({
    data: {
      dealId,
      userId: opts.userId ?? null,
      type: opts.activityType ?? 'stage_change',
      payload: { from: prevStageId, to: targetStage.id, system: true },
    },
  })

  triggerAutomation({ type: 'stage_leave', deal: { ...updated, stageId: prevStageId, pipelineId: prevPipelineId }, stageId: prevStageId }).catch(console.error)
  const hop = (opts.hop ?? 0) + 1
  if (hop <= 3) {
    triggerAutomation({ type: 'stage_enter', deal: updated, stageId: targetStage.id, hop }).catch(console.error)
  }

  const movedPayload = { deal: updated, prevStageId, newStageId: targetStage.id }
  emitToRoom(`pipeline:${prevPipelineId}`, 'DEAL_MOVED', movedPayload)
  if (targetStage.pipelineId !== prevPipelineId) {
    emitToRoom(`pipeline:${targetStage.pipelineId}`, 'DEAL_MOVED', movedPayload)
  }

  return updated
}
