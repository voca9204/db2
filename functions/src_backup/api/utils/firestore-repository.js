/**
 * Firestore 데이터 접근 계층
 * Firestore 데이터베이스 접근을 위한 리포지토리 패턴 구현
 */

const admin = require('firebase-admin');
const { getContextLogger } = require('../../utils/logger');

/**
 * Firestore 컬렉션에 대한 기본 리포지토리 클래스
 */
class FirestoreRepository {
  /**
   * 생성자
   * @param {string} collectionName - Firestore 컬렉션 이름
   */
  constructor(collectionName) {
    this.collectionName = collectionName;
    this.collection = admin.firestore().collection(collectionName);
    this.logger = getContextLogger();
  }

  /**
   * ID로 문서 조회
   * @param {string} id - 문서 ID
   * @return {Promise<Object|null>} 문서 데이터 또는 null
   */
  async findById(id) {
    try {
      const doc = await this.collection.doc(id).get();
      
      if (!doc.exists) {
        return null;
      }
      
      return {
        id: doc.id,
        ...doc.data()
      };
    } catch (error) {
      this.logger.error(`Error finding document by ID ${id} in ${this.collectionName}:`, error);
      throw error;
    }
  }

  /**
   * 필터, 정렬 및 페이지네이션으로 문서 조회
   * @param {Object} options - 조회 옵션
   * @return {Promise<Object>} 조회 결과 및 메타데이터
   */
  async find(options = {}) {
    try {
      const {
        filters = {},
        sort = { field: 'createdAt', direction: 'desc' },
        limit = 20,
        page = 1,
        startAfter = null,
        endBefore = null
      } = options;
      
      let query = this.collection;
      
      // 필터 적용
      Object.entries(filters).forEach(([field, value]) => {
        // 객체 형태의 필터 (연산자 포함)
        if (typeof value === 'object' && value !== null) {
          Object.entries(value).forEach(([operator, operValue]) => {
            if (operValue !== undefined && operValue !== null) {
              switch (operator) {
                case 'eq':
                  query = query.where(field, '==', operValue);
                  break;
                case 'ne':
                  query = query.where(field, '!=', operValue);
                  break;
                case 'gt':
                  query = query.where(field, '>', operValue);
                  break;
                case 'gte':
                  query = query.where(field, '>=', operValue);
                  break;
                case 'lt':
                  query = query.where(field, '<', operValue);
                  break;
                case 'lte':
                  query = query.where(field, '<=', operValue);
                  break;
                case 'in':
                  if (Array.isArray(operValue) && operValue.length > 0) {
                    query = query.where(field, 'in', operValue);
                  }
                  break;
                case 'contains':
                  // Firestore는 직접적인 contains 연산자를 지원하지 않습니다.
                  // 배열 멤버십을 사용하여 대체할 수 있습니다.
                  if (typeof operValue === 'string' || typeof operValue === 'number') {
                    query = query.where(field, 'array-contains', operValue);
                  }
                  break;
                default:
                  this.logger.warn(`Unsupported Firestore filter operator: ${operator}`);
              }
            }
          });
        } else if (value !== undefined && value !== null) {
          // 직접적인 값 비교
          query = query.where(field, '==', value);
        }
      });
      
      // 정렬 적용
      if (sort.field) {
        query = query.orderBy(sort.field, sort.direction || 'asc');
      }
      
      // 커서 기반 페이지네이션을 사용하는 경우
      if (startAfter) {
        // startAfter는 문서 참조 또는 문서 스냅샷일 수 있습니다.
        query = query.startAfter(startAfter);
      } else if (endBefore) {
        // endBefore는 문서 참조 또는 문서 스냅샷일 수 있습니다.
        query = query.endBefore(endBefore);
      } else {
        // 오프셋 기반 페이지네이션을 사용하는 경우
        const offset = (page - 1) * limit;
        if (offset > 0) {
          query = query.offset(offset);
        }
      }
      
      // 페이지네이션 적용
      query = query.limit(limit);
      
      // 쿼리 실행
      const snapshot = await query.get();
      
      // 결과 매핑
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // 총 문서 수 조회 (페이지네이션 메타데이터용)
      let total = 0;
      
      // 소규모 컬렉션인 경우 직접 카운트
      if (options.estimateCount !== true) {
        const countSnapshot = await this.collection.count().get();
        total = countSnapshot.data().count;
      } else {
        // 대규모 컬렉션인 경우 추정치 사용
        total = data.length === limit ? page * limit + 1 : page * limit;
      }
      
      // 페이지네이션 메타데이터
      return {
        data,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasNextPage: data.length === limit,
        hasPrevPage: page > 1,
        // 커서 기반 페이지네이션을 위한 메타데이터
        cursors: {
          startAfter: data.length > 0 ? snapshot.docs[data.length - 1] : null,
          endBefore: data.length > 0 ? snapshot.docs[0] : null
        }
      };
    } catch (error) {
      this.logger.error(`Error finding documents in ${this.collectionName}:`, error);
      throw error;
    }
  }

  /**
   * 새 문서 생성
   * @param {Object} data - 문서 데이터
   * @return {Promise<Object>} 생성된 문서
   */
  async create(data) {
    try {
      // 타임스탬프 추가
      const docData = {
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // ID가 제공된 경우
      if (data.id) {
        const { id, ...dataWithoutId } = docData;
        await this.collection.doc(id).set(dataWithoutId);
        
        return {
          id,
          ...dataWithoutId,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }
      
      // 자동 ID 할당
      const docRef = await this.collection.add(docData);
      
      return {
        id: docRef.id,
        ...docData,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    } catch (error) {
      this.logger.error(`Error creating document in ${this.collectionName}:`, error);
      throw error;
    }
  }

  /**
   * 문서 업데이트
   * @param {string} id - 문서 ID
   * @param {Object} data - 업데이트할 데이터
   * @return {Promise<Object>} 업데이트된 문서
   */
  async update(id, data) {
    try {
      // 문서 존재 여부 확인
      const docRef = this.collection.doc(id);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new Error(`Document with ID ${id} not found in ${this.collectionName}`);
      }
      
      // 타임스탬프 추가
      const updateData = {
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // 업데이트 수행
      await docRef.update(updateData);
      
      // 업데이트된 문서 반환
      return this.findById(id);
    } catch (error) {
      this.logger.error(`Error updating document ${id} in ${this.collectionName}:`, error);
      throw error;
    }
  }

  /**
   * 문서 삭제
   * @param {string} id - 문서 ID
   * @return {Promise<Object>} 삭제 결과
   */
  async delete(id) {
    try {
      // 문서 존재 여부 확���
      const docRef = this.collection.doc(id);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new Error(`Document with ID ${id} not found in ${this.collectionName}`);
      }
      
      // 삭제 수행
      await docRef.delete();
      
      return { id, deleted: true };
    } catch (error) {
      this.logger.error(`Error deleting document ${id} from ${this.collectionName}:`, error);
      throw error;
    }
  }

  /**
   * 일괄 문서 조회
   * @param {Array<string>} ids - 문서 ID 배열
   * @return {Promise<Array<Object>>} 조회된 문서 배열
   */
  async findByIds(ids) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        return [];
      }
      
      // Firestore는 한 번에 최대 10개의 문서만 가져올 수 있습니다.
      const batches = [];
      for (let i = 0; i < ids.length; i += 10) {
        const batch = ids.slice(i, i + 10);
        batches.push(batch);
      }
      
      // 각 배치별로 문서 조회
      const results = [];
      for (const batch of batches) {
        const batchDocs = await Promise.all(
          batch.map(id => this.collection.doc(id).get())
        );
        
        batchDocs.forEach(doc => {
          if (doc.exists) {
            results.push({
              id: doc.id,
              ...doc.data()
            });
          }
        });
      }
      
      return results;
    } catch (error) {
      this.logger.error(`Error finding documents by IDs in ${this.collectionName}:`, error);
      throw error;
    }
  }

  /**
   * 컬렉션 통계 조회
   * @return {Promise<Object>} 컬렉션 통계
   */
  async getStats() {
    try {
      const snapshot = await this.collection.get();
      
      return {
        count: snapshot.size,
        collectionId: this.collectionName,
        exists: snapshot.size > 0
      };
    } catch (error) {
      this.logger.error(`Error getting stats for ${this.collectionName}:`, error);
      throw error;
    }
  }

  /**
   * 트랜잭션 내에서 문서 생성 또는 업데이트
   * @param {string} id - 문서 ID
   * @param {Object} data - 문서 데이터
   * @param {Object} options - 옵션
   * @return {Promise<Object>} 생성 또는 업데이트된 문서
   */
  async createOrUpdate(id, data, options = {}) {
    try {
      const { merge = true } = options;
      
      // 타임스탬프 추가
      const docData = {
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // 문서 레퍼런스
      const docRef = this.collection.doc(id);
      
      // 트랜잭션 수행
      const result = await admin.firestore().runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        
        if (!doc.exists) {
          // 문서가 없는 경우 생성
          docData.createdAt = admin.firestore.FieldValue.serverTimestamp();
          transaction.set(docRef, docData);
          
          return {
            id,
            ...docData,
            createdAt: new Date(),
            updatedAt: new Date(),
            isNew: true
          };
        } else {
          // 문서가 있는 경우 업데이트
          if (merge) {
            // 기존 데이터와 병합
            transaction.update(docRef, docData);
          } else {
            // 기존 데이터 대체
            transaction.set(docRef, docData);
          }
          
          return {
            id,
            ...doc.data(),
            ...docData,
            updatedAt: new Date(),
            isNew: false
          };
        }
      });
      
      return result;
    } catch (error) {
      this.logger.error(`Error in createOrUpdate for ${id} in ${this.collectionName}:`, error);
      throw error;
    }
  }
}

module.exports = FirestoreRepository;
