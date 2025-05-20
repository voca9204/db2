/**
 * Firestore 리포지토리 클래스
 * Firebase Firestore 기반 데이터 접근 계층(DAL) 구현
 */

const admin = require('firebase-admin');
const { getContextLogger } = require('../../utils/logger');
const { DatabaseError, NotFoundError } = require('../../api/middleware/error-handler');

/**
 * Firestore 리포지토리 클래스
 * Firestore 컬렉션에 대한 CRUD 작업 제공
 */
class FirestoreRepository {
  /**
   * 생성자
   * 
   * @param {string} collectionName - Firestore 컬렉션명
   */
  constructor(collectionName) {
    this.collectionName = collectionName;
    this.logger = getContextLogger();
    this.db = admin.firestore();
    this.collection = this.db.collection(collectionName);
  }
  
  /**
   * 문서 ID로 단일 문서 조회
   * 
   * @param {string} id - 문서 ID
   * @param {Object} options - 조회 옵션
   * @return {Promise<Object>} 조회된 문서
   * @throws {NotFoundError} 문서를 찾을 수 없는 경우
   */
  async findById(id, options = {}) {
    try {
      const docRef = this.collection.doc(id);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new NotFoundError(`${this.collectionName} document with ID ${id} not found`);
      }
      
      // 문서 ID 포함
      return {
        id: doc.id,
        ...doc.data()
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      this.logger.error(`Error finding ${this.collectionName} document by ID ${id}:`, error);
      throw new DatabaseError(`Failed to find ${this.collectionName} document`);
    }
  }
  
  /**
   * 여러 조건으로 단일 문서 조회
   * 
   * @param {Object} filters - 조회 필터
   * @param {Object} options - 조회 옵션
   * @return {Promise<Object>} 조회된 문서
   * @throws {NotFoundError} 문서를 찾을 수 없는 경우
   */
  async findOne(filters = {}, options = {}) {
    try {
      let query = this.collection;
      
      // 필터 조건 적용
      Object.entries(filters).forEach(([field, value]) => {
        query = query.where(field, '==', value);
      });
      
      // 단일 문서 제한
      query = query.limit(1);
      
      // 쿼리 실행
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        throw new NotFoundError(`${this.collectionName} document not found`);
      }
      
      const doc = snapshot.docs[0];
      
      // 문서 ID 포함
      return {
        id: doc.id,
        ...doc.data()
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      this.logger.error(`Error finding ${this.collectionName} document:`, error);
      throw new DatabaseError(`Failed to find ${this.collectionName} document`);
    }
  }
  
  /**
   * 모든 문서 조회
   * 
   * @param {Object} options - 조회 옵션
   * @return {Promise<Object>} 조회된 문서 목록 및 메타데이터
   */
  async findAll(options = {}) {
    try {
      const {
        filters = {},
        sorting = null,
        pagination = { page: 1, limit: 20 }
      } = options;
      
      let query = this.collection;
      
      // 필터 조건 적용
      Object.entries(filters).forEach(([field, value]) => {
        if (typeof value === 'object' && value !== null) {
          // 복합 조건 (연산자 포함)
          if (value.operator && value.value !== undefined) {
            query = query.where(field, value.operator, value.value);
          } 
          // 배열 포함 여부 (array-contains)
          else if (Array.isArray(value) && value.length > 0) {
            query = query.where(field, 'array-contains-any', value.slice(0, 10)); // 최대 10개 제한
          }
        } else {
          // 단순 같음 조건
          query = query.where(field, '==', value);
        }
      });
      
      // 정렬 적용
      if (sorting && sorting.field) {
        const direction = (sorting.direction || 'asc').toLowerCase();
        query = query.orderBy(sorting.field, direction);
      }
      
      // 전체 문서 수 조회 (복잡한 쿼리에 대한 최적화 필요)
      let totalQuery = this.collection;
      let totalDocs = 0;
      
      // 간단한 필터만 있는 경우 전체 개수 조회 가능
      if (Object.keys(filters).length === 0) {
        const countSnapshot = await totalQuery.count().get();
        totalDocs = countSnapshot.data().count;
      }
      
      // 페이지네이션 설정
      const { page = 1, limit = 20 } = pagination;
      const offset = (page - 1) * limit;
      
      // 오프셋 페이지네이션 구현 (대규모 컬렉션에서는 커서 기반 페이지네이션 권장)
      if (offset > 0) {
        // Firestore는 직접적인 오프셋을 지원하지 않으므로 limit+offset으로 구현
        const allSnapshot = await query.limit(offset + limit).get();
        const docs = allSnapshot.docs.slice(offset).map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // 복잡한 쿼리에서 전체 개수 추정
        if (Object.keys(filters).length > 0) {
          totalDocs = allSnapshot.size + offset; // 추정치
        }
        
        return {
          items: docs,
          total: totalDocs,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(totalDocs / limit)
        };
      } else {
        // 첫 페이지인 경우 간단하게 limit만 적용
        const snapshot = await query.limit(limit).get();
        const docs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // 복잡한 쿼리에서 전체 개수 추정
        if (Object.keys(filters).length > 0) {
          totalDocs = snapshot.size; // 첫 페이지 크기로 추정
        }
        
        return {
          items: docs,
          total: totalDocs,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(totalDocs / limit)
        };
      }
    } catch (error) {
      this.logger.error(`Error finding all ${this.collectionName} documents:`, error);
      throw new DatabaseError(`Failed to find ${this.collectionName} documents`);
    }
  }
  
  /**
   * 새 문서 생성
   * 
   * @param {Object} data - 생성할 문서 데이터
   * @param {Object} options - 생성 옵션
   * @return {Promise<Object>} 생성된 문서
   */
  async create(data, options = {}) {
    try {
      const { id = null } = options;
      
      // 생성 시간 및 수정 시간 자동 설정
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const docData = {
        ...data,
        createdAt: data.createdAt || timestamp,
        updatedAt: data.updatedAt || timestamp
      };
      
      let docRef;
      
      // ID 직접 지정 여부에 따라 다른 처리
      if (id) {
        docRef = this.collection.doc(id);
        await docRef.set(docData);
      } else {
        docRef = await this.collection.add(docData);
      }
      
      // 생성된 문서 조회
      const doc = await docRef.get();
      
      return {
        id: doc.id,
        ...doc.data()
      };
    } catch (error) {
      this.logger.error(`Error creating ${this.collectionName} document:`, error);
      throw new DatabaseError(`Failed to create ${this.collectionName} document`);
    }
  }
  
  /**
   * 문서 업데이트
   * 
   * @param {string} id - 업데이트할 문서 ID
   * @param {Object} data - 업데이트할 데이터
   * @param {Object} options - 업데이트 옵션
   * @return {Promise<Object>} 업데이트된 문서
   * @throws {NotFoundError} 문서를 찾을 수 없는 경우
   */
  async update(id, data, options = {}) {
    try {
      const docRef = this.collection.doc(id);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new NotFoundError(`${this.collectionName} document with ID ${id} not found`);
      }
      
      // 업데이트 시간 자동 설정
      const updateData = {
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // 전체 업데이트 또는 부분 업데이트 옵션
      const { merge = true } = options;
      
      if (merge) {
        await docRef.update(updateData);
      } else {
        await docRef.set(updateData);
      }
      
      // 업데이트된 문서 조회
      const updatedDoc = await docRef.get();
      
      return {
        id: updatedDoc.id,
        ...updatedDoc.data()
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      this.logger.error(`Error updating ${this.collectionName} document with ID ${id}:`, error);
      throw new DatabaseError(`Failed to update ${this.collectionName} document`);
    }
  }
  
  /**
   * 문서 삭제
   * 
   * @param {string} id - 삭제할 문서 ID
   * @param {Object} options - 삭제 옵션
   * @return {Promise<boolean>} 삭제 성공 여부
   * @throws {NotFoundError} 문서를 찾을 수 없는 경우
   */
  async delete(id, options = {}) {
    try {
      const docRef = this.collection.doc(id);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new NotFoundError(`${this.collectionName} document with ID ${id} not found`);
      }
      
      await docRef.delete();
      
      return true;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      
      this.logger.error(`Error deleting ${this.collectionName} document with ID ${id}:`, error);
      throw new DatabaseError(`Failed to delete ${this.collectionName} document`);
    }
  }
  
  /**
   * 여러 문서 삭제
   * 
   * @param {Array} ids - 삭제할 문서 ID 배열
   * @param {Object} options - 삭제 옵션
   * @return {Promise<number>} 삭제된 문서 수
   */
  async deleteMany(ids, options = {}) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        return 0;
      }
      
      // 배치 작업 구현 (최대 500개씩)
      const batchSize = 500;
      let deletedCount = 0;
      
      // IDs 배열을 batches로 분할
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = this.db.batch();
        const currentBatch = ids.slice(i, i + batchSize);
        
        currentBatch.forEach(id => {
          const docRef = this.collection.doc(id);
          batch.delete(docRef);
        });
        
        await batch.commit();
        deletedCount += currentBatch.length;
      }
      
      return deletedCount;
    } catch (error) {
      this.logger.error(`Error deleting multiple ${this.collectionName} documents:`, error);
      throw new DatabaseError(`Failed to delete ${this.collectionName} documents`);
    }
  }
  
  /**
   * 조건부 삭제
   * 
   * @param {Object} filters - 삭제 조건
   * @param {Object} options - 삭제 옵션
   * @return {Promise<number>} 삭제된 문서 수
   */
  async deleteWhere(filters, options = {}) {
    try {
      if (!filters || Object.keys(filters).length === 0) {
        throw new Error('Filters are required for deleteWhere operation');
      }
      
      let query = this.collection;
      
      // 필터 조건 적용
      Object.entries(filters).forEach(([field, value]) => {
        query = query.where(field, '==', value);
      });
      
      // 일치하는 문서 조회
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        return 0;
      }
      
      // 배치 작업 구현 (최대 500개씩)
      const batchSize = 500;
      let deletedCount = 0;
      const docs = snapshot.docs;
      
      // 문서를 batches로 분할
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = this.db.batch();
        const currentBatch = docs.slice(i, i + batchSize);
        
        currentBatch.forEach(doc => {
          batch.delete(doc.ref);
        });
        
        await batch.commit();
        deletedCount += currentBatch.length;
      }
      
      return deletedCount;
    } catch (error) {
      this.logger.error(`Error deleting ${this.collectionName} documents with filters:`, error);
      throw new DatabaseError(`Failed to delete ${this.collectionName} documents`);
    }
  }
  
  /**
   * 존재 여부 확인
   * 
   * @param {string} id - 확인할 문서 ID
   * @return {Promise<boolean>} 존재 여부
   */
  async exists(id) {
    try {
      const docRef = this.collection.doc(id);
      const doc = await docRef.get();
      
      return doc.exists;
    } catch (error) {
      this.logger.error(`Error checking existence of ${this.collectionName} document with ID ${id}:`, error);
      throw new DatabaseError(`Failed to check existence of ${this.collectionName} document`);
    }
  }
  
  /**
   * 문서 수 조회
   * 
   * @param {Object} filters - 조회 필터
   * @return {Promise<number>} 문서 수
   */
  async count(filters = {}) {
    try {
      // Firestore count API 사용
      let query = this.collection;
      
      // 필터 조건 적용
      Object.entries(filters).forEach(([field, value]) => {
        query = query.where(field, '==', value);
      });
      
      // 전체 문서 수 조회
      const countSnapshot = await query.count().get();
      
      return countSnapshot.data().count;
    } catch (error) {
      this.logger.error(`Error counting ${this.collectionName} documents:`, error);
      throw new DatabaseError(`Failed to count ${this.collectionName} documents`);
    }
  }
  
  /**
   * 트랜잭션 내에서 생성
   * 
   * @param {Object} data - 생성할 문서 데이터
   * @param {Transaction} transaction - Firestore 트랜잭션 객체
   * @param {Object} options - 생성 옵션
   * @return {Object} 생성된 문서 참조
   */
  createInTransaction(data, transaction, options = {}) {
    try {
      const { id = null } = options;
      
      // 생성 시간 및 수정 시간 자동 설정
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      const docData = {
        ...data,
        createdAt: data.createdAt || timestamp,
        updatedAt: data.updatedAt || timestamp
      };
      
      let docRef;
      
      // ID 직접 지정 여부에 따라 다른 처리
      if (id) {
        docRef = this.collection.doc(id);
      } else {
        docRef = this.collection.doc();
      }
      
      // 트랜잭션 내에서 문서 생성
      transaction.set(docRef, docData);
      
      return {
        ref: docRef,
        id: docRef.id,
        data: docData
      };
    } catch (error) {
      this.logger.error(`Error creating ${this.collectionName} document in transaction:`, error);
      throw error;
    }
  }
  
  /**
   * 트랜잭션 내에서 업데이트
   * 
   * @param {string} id - 업데이트할 문서 ID
   * @param {Object} data - 업데이트할 데이터
   * @param {Transaction} transaction - Firestore 트랜잭션 객체
   * @param {Object} options - 업데이트 옵션
   * @return {Object} 업데이트된 문서 참조
   */
  updateInTransaction(id, data, transaction, options = {}) {
    try {
      const docRef = this.collection.doc(id);
      
      // 업데이트 시간 자동 설정
      const updateData = {
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // 전체 업데이트 또는 부분 업데이트 옵션
      const { merge = true } = options;
      
      if (merge) {
        transaction.update(docRef, updateData);
      } else {
        transaction.set(docRef, updateData);
      }
      
      return {
        ref: docRef,
        id,
        data: updateData
      };
    } catch (error) {
      this.logger.error(`Error updating ${this.collectionName} document in transaction:`, error);
      throw error;
    }
  }
  
  /**
   * 트랜잭션 내에서 삭제
   * 
   * @param {string} id - 삭제할 문서 ID
   * @param {Transaction} transaction - Firestore 트랜잭션 객체
   * @return {Object} 삭제된 문서 참조
   */
  deleteInTransaction(id, transaction) {
    try {
      const docRef = this.collection.doc(id);
      
      // 트랜잭션 내에서 문서 삭제
      transaction.delete(docRef);
      
      return {
        ref: docRef,
        id
      };
    } catch (error) {
      this.logger.error(`Error deleting ${this.collectionName} document in transaction:`, error);
      throw error;
    }
  }
  
  /**
   * 트랜잭션 실행
   * 
   * @param {Function} callback - 트랜잭션 콜백 함수
   * @return {Promise<any>} 트랜잭션 결과
   */
  async runTransaction(callback) {
    try {
      return await this.db.runTransaction(async (transaction) => {
        return callback(transaction, this);
      });
    } catch (error) {
      this.logger.error(`Error running transaction for ${this.collectionName}:`, error);
      throw new DatabaseError(`Failed to run transaction for ${this.collectionName}`);
    }
  }
  
  /**
   * 배치 작업 실행
   * 
   * @param {Function} callback - 배치 콜백 함수
   * @return {Promise<any>} 배치 작업 결과
   */
  async runBatch(callback) {
    try {
      const batch = this.db.batch();
      const result = callback(batch, this);
      
      await batch.commit();
      
      return result;
    } catch (error) {
      this.logger.error(`Error running batch for ${this.collectionName}:`, error);
      throw new DatabaseError(`Failed to run batch for ${this.collectionName}`);
    }
  }
}

module.exports = FirestoreRepository;
