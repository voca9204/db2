/**
 * 고가치 사용자 분석 API 경로 문서화
 */

/**
 * @swagger
 * /users/high-value/active:
 *   get:
 *     summary: 활성 고가치 사용자 조회
 *     description: |
 *       활성 상태인 고가치 사용자 목록을 조회합니다. 
 *       고가치 사용자는 최소 베팅액과 활동 일수를 기준으로 정의되며, 
 *       최대 비활성 기간 이내에 활동한 사용자만 포함됩니다.
 *     tags: 
 *       - 고가치 사용자
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: minNetBet
 *         description: 최소 순 베팅액 (기본값 50000)
 *         schema:
 *           type: number
 *       - in: query
 *         name: minPlayDays
 *         description: 최소 활동 일수 (기본값 7)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: maxInactiveDays
 *         description: 최대 비활성 일수 (기본값 30)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: sortBy
 *         description: 정렬 기준 필드
 *         schema:
 *           type: string
 *           enum: [userId, userName, playDays, netBet, lastActivity, inactiveDays]
 *           default: netBet
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
 *       - in: query
 *         name: limit
 *         description: 페이지당 결과 수 (기본값 20, 최대 100)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *       - in: query
 *         name: includeDepositInfo
 *         description: 입금 정보 포함 여부 (기본값 false)
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: 활성 고가치 사용자 목록 조회 성공
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
 *                   example: "Active high value users retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/User'
 *                       - type: object
 *                         properties:
 *                           depositInfo:
 *                             type: object
 *                             properties:
 *                               depositCount:
 *                                 type: integer
 *                                 example: 5
 *                               totalDeposits:
 *                                 type: number
 *                                 format: float
 *                                 example: 250000
 *                               lastDepositDate:
 *                                 type: string
 *                                 format: date
 *                                 example: '2025-05-10'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 * 
 * /users/high-value/dormant:
 *   get:
 *     summary: 휴면 고가치 사용자 조회
 *     description: |
 *       휴면 상태인 고가치 사용자 목록을 조회합니다. 
 *       고가치 사용자는 최소 베팅액과 활동 일수를 기준으로 정의되며, 
 *       최소 비활성 기간 이상 활동이 없는 사용자만 포함됩니다.
 *     tags: 
 *       - 고가치 사용자
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: minNetBet
 *         description: 최소 순 베팅액 (기본값 50000)
 *         schema:
 *           type: number
 *       - in: query
 *         name: minPlayDays
 *         description: 최소 활동 일수 (기본값 7)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: minInactiveDays
 *         description: 최소 비활성 일수 (기본값 30)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: maxInactiveDays
 *         description: 최대 비활성 일수 (기본값 없음)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: sortBy
 *         description: 정렬 기준 필드
 *         schema:
 *           type: string
 *           enum: [userId, userName, playDays, netBet, lastActivity, inactiveDays]
 *           default: inactiveDays
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
 *       - in: query
 *         name: limit
 *         description: 페이지당 결과 수 (기본값 20, 최대 100)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *       - in: query
 *         name: includeDepositInfo
 *         description: 입금 정보 포함 여부 (기본값 false)
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: 휴면 고가치 사용자 목록 조회 성공
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
 *                   example: "Dormant high value users retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/User'
 *                       - type: object
 *                         properties:
 *                           depositInfo:
 *                             type: object
 *                             properties:
 *                               depositCount:
 *                                 type: integer
 *                                 example: 3
 *                               totalDeposits:
 *                                 type: number
 *                                 format: float
 *                                 example: 180000
 *                               lastDepositDate:
 *                                 type: string
 *                                 format: date
 *                                 example: '2025-04-05'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 * 
 * /users/high-value/segments:
 *   get:
 *     summary: 사용자 세그먼트 분석
 *     description: |
 *       고가치 사용자를 세그먼트별로 분석한 결과를 제공합니다.
 *       활성/휴면 상태, 베팅 금액, 이벤트 참여 등 다양한 세그먼트로 분류합니다.
 *     tags: 
 *       - 고가치 사용자
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: minNetBet
 *         description: 최소 순 베팅액 (기본값 50000)
 *         schema:
 *           type: number
 *       - in: query
 *         name: minPlayDays
 *         description: 최소 활동 일수 (기본값 7)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: timeRange
 *         description: 분석 기간
 *         schema:
 *           type: string
 *           enum: [7d, 30d, 90d, 180d, 365d, all]
 *           default: all
 *     responses:
 *       200:
 *         description: 사용자 세그먼트 분석 결과 조회 성공
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
 *                   example: "User segment analysis completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     criteria:
 *                       type: object
 *                       properties:
 *                         minNetBet:
 *                           type: number
 *                           example: 50000
 *                         minPlayDays:
 *                           type: integer
 *                           example: 7
 *                         timeRange:
 *                           type: string
 *                           example: 'all'
 *                     analysisTimestamp:
 *                       type: string
 *                       format: date-time
 *                       example: '2025-05-19T12:34:56.789Z'
 *                     totalStats:
 *                       type: object
 *                       properties:
 *                         totalUsers:
 *                           type: integer
 *                           example: 1250
 *                         avgPlayDays:
 *                           type: number
 *                           example: 22.5
 *                         avgNetBet:
 *                           type: number
 *                           example: 375000
 *                         avgInactiveDays:
 *                           type: number
 *                           example: 45.2
 *                     segmentDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           segment:
 *                             type: string
 *                             example: 'active'
 *                           userCount:
 *                             type: integer
 *                             example: 850
 *                           avgPlayDays:
 *                             type: number
 *                             example: 25.8
 *                           avgNetBet:
 *                             type: number
 *                             example: 425000
 *                     betDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           betTier:
 *                             type: string
 *                             example: 'tier_2_100k_500k'
 *                           userCount:
 *                             type: integer
 *                             example: 650
 *                           avgPlayDays:
 *                             type: number
 *                             example: 18.2
 *                           avgInactiveDays:
 *                             type: number
 *                             example: 12.5
 *                     eventParticipation:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           eventParticipation:
 *                             type: string
 *                             example: 'few_events'
 *                           userCount:
 *                             type: integer
 *                             example: 320
 *                           avgPlayDays:
 *                             type: number
 *                             example: 24.3
 *                           avgNetBet:
 *                             type: number
 *                             example: 350000
 *                           avgInactiveDays:
 *                             type: number
 *                             example: 15.8
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 * 
 * /users/high-value/reactivation/targets:
 *   get:
 *     summary: 재활성화 대상 사용자 추천
 *     description: |
 *       재활성화 전략이 효과적일 것으로 예측되는 휴면 고가치 사용자 목록을 추천합니다.
 *       베팅 행동, 이벤트 참여 기록, 승률 등 다양한 요소를 고려한 알고리즘으로 추천합니다.
 *     tags: 
 *       - 고가치 사용자
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: minNetBet
 *         description: 최소 순 베팅액 (기본값 50000)
 *         schema:
 *           type: number
 *       - in: query
 *         name: minPlayDays
 *         description: 최소 활동 일수 (기본값 7)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: minInactiveDays
 *         description: 최소 비활성 일수 (기본값 30)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: maxInactiveDays
 *         description: 최대 비활성 일수 (기본값 365)
 *         schema:
 *           type: integer
 *       - in: query
 *         name: eventTypes
 *         description: 이벤트 유형 필터 (콤마로 구분)
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         style: form
 *         explode: false
 *       - in: query
 *         name: includeEventHistory
 *         description: 이벤트 참여 내역 포함 여부 (기본값 false)
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: page
 *         description: 페이지 번호 (기본값 1)
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         description: 페이지당 결과 수 (기본값 20, 최대 100)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: 재활성화 대상 사용자 추천 조회 성공
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
 *                   example: "Reactivation target users retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/User'
 *                       - type: object
 *                         properties:
 *                           reactivationScore:
 *                             type: number
 *                             format: float
 *                             example: 8.5
 *                           eventCount:
 *                             type: integer
 *                             example: 4
 *                           totalWinAmount:
 *                             type: number
 *                             format: float
 *                             example: 320000
 *                           eventHistory:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 eventId:
 *                                   type: integer
 *                                   example: 101
 *                                 eventName:
 *                                   type: string
 *                                   example: '여름 특별 이벤트'
 *                                 eventType:
 *                                   type: string
 *                                   example: 'seasonal'
 *                                 participationDate:
 *                                   type: string
 *                                   format: date
 *                                   example: '2025-04-15'
 *                                 rewardAmount:
 *                                   type: number
 *                                   format: float
 *                                   example: 5000
 *                           recommendedStrategy:
 *                             type: string
 *                             example: 'winning_boost'
 *                           recommendationReason:
 *                             type: string
 *                             example: '이 사용자는 게임에서 승리했던 경험이 많습니다 (순이익: 150,000). 승리 기회를 강조한 이벤트가 효과적일 것입니다.'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 * 
 * /users/high-value/{userId}:
 *   get:
 *     summary: 고가치 사용자 상세 정보 조회
 *     description: |
 *       특정 고가치 사용자의 상세 정보, 활동 내역, 이벤트 참여 내역 등을 조회합니다.
 *     tags: 
 *       - 고가치 사용자
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         description: 사용자 ID
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: includeActivity
 *         description: 활동 내역 포함 여부 (기본값 true)
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: includeEvents
 *         description: 이벤트 참여 내역 포함 여부 (기본값 true)
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: activityDays
 *         description: 활동 내역 조회 일수 (기본값 30)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *     responses:
 *       200:
 *         description: 사용자 상세 정보 조회 성공
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
 *                   example: "User details retrieved successfully"
 *                 data:
 *                   type: object
 *                   allOf:
 *                     - $ref: '#/components/schemas/User'
 *                     - type: object
 *                       properties:
 *                         email:
 *                           type: string
 *                           example: 'user123@example.com'
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                           example: '2024-11-20T08:15:30Z'
 *                         activityHistory:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               date:
 *                                 type: string
 *                                 format: date
 *                                 example: '2025-05-15'
 *                               sessionCount:
 *                                 type: integer
 *                                 example: 3
 *                               totalNetBet:
 *                                 type: number
 *                                 format: float
 *                                 example: 75000
 *                               totalWinAmount:
 *                                 type: number
 *                                 format: float
 *                                 example: 80000
 *                         eventParticipation:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               eventId:
 *                                 type: integer
 *                                 example: 101
 *                               eventName:
 *                                 type: string
 *                                 example: '여름 특별 이벤트'
 *                               participationDate:
 *                                 type: string
 *                                 format: date
 *                                 example: '2025-05-05'
 *                               rewardAmount:
 *                                 type: number
 *                                 format: float
 *                                 example: 5000
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
