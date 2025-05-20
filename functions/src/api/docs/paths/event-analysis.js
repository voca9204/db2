/**
 * 이벤트 분석 API 경로 문서화
 */

/**
 * @swagger
 * /events:
 *   get:
 *     summary: 이벤트 목록 조회
 *     description: |
 *       이벤트 목록을 조회합니다.
 *       날짜, 상태 등으로 필터링하고 페이지네이션을 지원합니다.
 *     tags: 
 *       - 이벤트 분석
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         description: 이벤트 시작일 필터 (ISO 형식)
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         description: 이벤트 종료일 필터 (ISO 형식)
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: status
 *         description: 이벤트 상태 필터
 *         schema:
 *           type: string
 *           enum: [upcoming, active, completed]
 *       - in: query
 *         name: sortBy
 *         description: 정렬 기준 필드
 *         schema:
 *           type: string
 *           enum: [eventId, eventName, startDate, endDate, participantCount]
 *           default: startDate
 *       - in: query
 *         name: sortOrder
 *         description: 정렬 방향
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *       - in: query
 *         name: page
 *         description: 페이지 번호 (기본값 1)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         description: 페이지당 결과 수 (기본값 20, 최대 100)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: 이벤트 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Events retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 * 
 * /events/{eventId}/analysis:
 *   get:
 *     summary: 이벤트 상세 분석 조회
 *     description: |
 *       특정 이벤트의 상세 정보와 분석 결과를 조회합니다.
 *       참여자 세그먼트 분포, 전환율 등 다양한 분석 정보를 제공합니다.
 *     tags: 
 *       - 이벤트 분석
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         description: 이벤트 ID
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 이벤트 상세 분석 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Event analysis retrieved successfully"
 *                 data:
 *                   type: object
 *                   allOf:
 *                     - $ref: '#/components/schemas/Event'
 *                     - type: object
 *                       properties:
 *                         analysis:
 *                           type: object
 *                           properties:
 *                             dormantParticipantCount:
 *                               type: integer
 *                               example: 75
 *                             conversionCount:
 *                               type: integer
 *                               example: 42
 *                             conversionRate:
 *                               type: string
 *                               example: "16.80"
 *                             participantSegments:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   segment:
 *                                     type: string
 *                                     example: "inactive_3_months"
 *                                   userCount:
 *                                     type: integer
 *                                     example: 45
 *                             conversionRateBySegment:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   segment:
 *                                     type: string
 *                                     example: "inactive_3_months"
 *                                   totalUsers:
 *                                     type: integer
 *                                     example: 45
 *                                   convertedUsers:
 *                                     type: integer
 *                                     example: 12
 *                                   conversionRate:
 *                                     type: string
 *                                     example: "26.67"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 * 
 * /events/analysis/conversion:
 *   get:
 *     summary: 이벤트 전환율 분석
 *     description: |
 *       전체 이벤트의 전환율과 관련 분석 데이터를 조회합니다.
 *       이벤트 유형, 이벤트 보상 금액, 사용자 세그먼트 등에 따른 전환율 분석 정보를 제공합니다.
 *     tags: 
 *       - 이벤트 분석
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         description: 이벤트 시작일 필터 (ISO 형식)
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         description: 이벤트 종료일 필터 (ISO 형식)
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: minParticipants
 *         description: 최소 참여자 수 (기본값 10)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *     responses:
 *       200:
 *         description: 이벤트 전환율 분석 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Event conversion analysis completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     eventConversions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           eventId:
 *                             type: integer
 *                             example: 101
 *                           eventName:
 *                             type: string
 *                             example: "여름 특별 이벤트"
 *                           startDate:
 *                             type: string
 *                             format: date
 *                             example: "2025-05-01"
 *                           endDate:
 *                             type: string
 *                             format: date
 *                             example: "2025-05-31"
 *                           rewardType:
 *                             type: string
 *                             example: "bonus"
 *                           rewardAmount:
 *                             type: number
 *                             example: 10000
 *                           participantCount:
 *                             type: integer
 *                             example: 250
 *                           dormantUserCount:
 *                             type: integer
 *                             example: 75
 *                           activeUserCount:
 *                             type: integer
 *                             example: 175
 *                           conversionCount:
 *                             type: integer
 *                             example: 42
 *                           conversionRate:
 *                             type: string
 *                             example: "16.80"
 *                           totalDepositAmount:
 *                             type: number
 *                             example: 1680000
 *                           avgDepositAmount:
 *                             type: number
 *                             example: 40000
 *                     rewardAnalysis:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           rewardType:
 *                             type: string
 *                             example: "bonus"
 *                           avgRewardAmount:
 *                             type: number
 *                             example: 8500
 *                           avgConversionRate:
 *                             type: number
 *                             example: 15.25
 *                     dormancyAnalysis:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           period:
 *                             type: string
 *                             example: "31-90_days"
 *                           userCount:
 *                             type: integer
 *                             example: 85
 *                           convertedCount:
 *                             type: integer
 *                             example: 22
 *                           conversionRate:
 *                             type: number
 *                             example: 25.88
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalEvents:
 *                           type: integer
 *                           example: 12
 *                         avgConversionRate:
 *                           type: number
 *                           example: 18.45
 *                         bestEvent:
 *                           type: object
 *                           properties:
 *                             eventId:
 *                               type: integer
 *                               example: 105
 *                             eventName:
 *                               type: string
 *                               example: "VIP 복귀 이벤트"
 *                             conversionRate:
 *                               type: string
 *                               example: "32.50"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
