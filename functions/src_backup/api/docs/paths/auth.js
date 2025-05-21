/**
 * Firebase Authentication API 경로 문서화
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: 사용자 목록 조회
 *     description: |
 *       Firebase Authentication에 등록된 모든 사용자 목록을 조회합니다.
 *       각 사용자의 기본 정보 및 역할 정보를 포함합니다.
 *     tags: 
 *       - 사용자 관리
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: maxResults
 *         description: 최대 결과 수 (기본값 1000)
 *         schema:
 *           type: integer
 *           default: 1000
 *       - in: query
 *         name: pageToken
 *         description: 다음 페이지 토큰
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 사용자 목록 조회 성공
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
 *                   example: "Users retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           uid:
 *                             type: string
 *                             example: "g8NlkKIYJMOzO9dnEX90RBJfXxx2"
 *                           email:
 *                             type: string
 *                             example: "admin@example.com"
 *                           displayName:
 *                             type: string
 *                             example: "Admin User"
 *                           disabled:
 *                             type: boolean
 *                             example: false
 *                           emailVerified:
 *                             type: boolean
 *                             example: true
 *                           metadata:
 *                             type: object
 *                             properties:
 *                               creationTime:
 *                                 type: string
 *                                 example: "2025-03-15T10:30:00.000Z"
 *                               lastSignInTime:
 *                                 type: string
 *                                 example: "2025-05-18T14:22:35.000Z"
 *                           roles:
 *                             type: array
 *                             items:
 *                               type: string
 *                             example: ["admin", "analyst"]
 *                     pageToken:
 *                       type: string
 *                       example: "next_page_token_value"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *   post:
 *     summary: 새 사용자 생성
 *     description: |
 *       새로운 사용자 계정을 생성합니다.
 *       이메일, 비밀번호, 표시 이름 및 역할 정보를 설정합니다.
 *     tags: 
 *       - 사용자 관리
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - displayName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "secureP@ssw0rd"
 *               displayName:
 *                 type: string
 *                 minLength: 3
 *                 example: "John Doe"
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *                 default: ["user"]
 *                 example: ["analyst"]
 *               disabled:
 *                 type: boolean
 *                 default: false
 *                 example: false
 *     responses:
 *       201:
 *         description: 사용자 생성 성공
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
 *                   example: "User created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     uid:
 *                       type: string
 *                       example: "h9MjkLIYJMOzO9dnEXa1RCJgYyy3"
 *                     email:
 *                       type: string
 *                       example: "user@example.com"
 *                     displayName:
 *                       type: string
 *                       example: "John Doe"
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["analyst"]
 *                     disabled:
 *                       type: boolean
 *                       example: false
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       409:
 *         description: 이메일 중복
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 * 
 * /users/{uid}:
 *   get:
 *     summary: 사용자 정보 조회
 *     description: |
 *       특정 사용자의 상세 정보를 조회합니다.
 *       사용자 기본 정보 및 역할 정보를 포함합니다.
 *     tags: 
 *       - 사용자 관리
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uid
 *         description: 사용자 ID
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 사용자 정보 조회 성공
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
 *                   example: "User retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     uid:
 *                       type: string
 *                       example: "g8NlkKIYJMOzO9dnEX90RBJfXxx2"
 *                     email:
 *                       type: string
 *                       example: "user@example.com"
 *                     displayName:
 *                       type: string
 *                       example: "John Doe"
 *                     disabled:
 *                       type: boolean
 *                       example: false
 *                     emailVerified:
 *                       type: boolean
 *                       example: true
 *                     metadata:
 *                       type: object
 *                       properties:
 *                         creationTime:
 *                           type: string
 *                           example: "2025-03-15T10:30:00.000Z"
 *                         lastSignInTime:
 *                           type: string
 *                           example: "2025-05-18T14:22:35.000Z"
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["analyst"]
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *   put:
 *     summary: 사용자 정보 업데이트
 *     description: |
 *       특정 사용자의 정보를 업데이트합니다.
 *       이메일, 비밀번호, 표시 이름, 역할 정보 및 계정 상태를 변경할 수 있습니다.
 *     tags: 
 *       - 사용자 관리
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uid
 *         description: 사용자 ID
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "updated@example.com"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "newSecureP@ssw0rd"
 *               displayName:
 *                 type: string
 *                 minLength: 3
 *                 example: "Updated Name"
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["analyst", "user"]
 *               disabled:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: 사용자 정보 업데이트 성공
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
 *                   example: "User updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     uid:
 *                       type: string
 *                       example: "g8NlkKIYJMOzO9dnEX90RBJfXxx2"
 *                     email:
 *                       type: string
 *                       example: "updated@example.com"
 *                     displayName:
 *                       type: string
 *                       example: "Updated Name"
 *                     disabled:
 *                       type: boolean
 *                       example: false
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["analyst", "user"]
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       409:
 *         description: 이메일 중복
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *   delete:
 *     summary: 사용자 삭제
 *     description: |
 *       특정 사용자 계정을 삭제합니다.
 *       Firebase Authentication 및 Firestore에서 사용자 정보가 모두 삭제됩니다.
 *     tags: 
 *       - 사용자 관리
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uid
 *         description: 사용자 ID
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 사용자 삭제 성공
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
 *                   example: "User deleted successfully"
 *                 data:
 *                   type: null
 *                   nullable: true
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       422:
 *         description: 자신의 계정은 삭제할 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 * 
 * /users/me:
 *   get:
 *     summary: 현재 사용자 정보 조회
 *     description: |
 *       현재 인증된 사용자의 정보를 조회합니다.
 *       사용자 기본 정보 및 역할 정보를 포함합니다.
 *     tags: 
 *       - 사용자 관리
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 현재 사용자 정보 조회 성공
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
 *                   example: "Current user retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     uid:
 *                       type: string
 *                       example: "g8NlkKIYJMOzO9dnEX90RBJfXxx2"
 *                     email:
 *                       type: string
 *                       example: "user@example.com"
 *                     displayName:
 *                       type: string
 *                       example: "John Doe"
 *                     emailVerified:
 *                       type: boolean
 *                       example: true
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["analyst"]
 *                     metadata:
 *                       type: object
 *                       properties:
 *                         creationTime:
 *                           type: string
 *                           example: "2025-03-15T10:30:00.000Z"
 *                         lastSignInTime:
 *                           type: string
 *                           example: "2025-05-18T14:22:35.000Z"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *   put:
 *     summary: 현재 사용자 정보 업데이트
 *     description: |
 *       현재 인증된 사용자의 정보를 업데이트합니다.
 *       표시 이름만 변경할 수 있습니다.
 *     tags: 
 *       - 사용자 관리
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - displayName
 *             properties:
 *               displayName:
 *                 type: string
 *                 minLength: 3
 *                 example: "Updated My Name"
 *     responses:
 *       200:
 *         description: 사용자 정보 업데이트 성공
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
 *                   example: "Profile updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     uid:
 *                       type: string
 *                       example: "g8NlkKIYJMOzO9dnEX90RBJfXxx2"
 *                     email:
 *                       type: string
 *                       example: "user@example.com"
 *                     displayName:
 *                       type: string
 *                       example: "Updated My Name"
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["analyst"]
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
