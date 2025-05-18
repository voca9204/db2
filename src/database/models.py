"""
데이터베이스 모델 정의 모듈

이 모듈은 SQLAlchemy를 사용하여 데이터베이스 테이블에 대응하는 모델 클래스를 정의합니다.
기본 모델 클래스와 공통 열 정의를 포함합니다.
"""

import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean, Float
from sqlalchemy.ext.declarative import declared_attr
from sqlalchemy.orm import relationship

from .orm import Base

class TimestampMixin:
    """
    생성 및 수정 시간 정보를 제공하는 Mixin 클래스
    """
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)

class BaseModel(Base):
    """
    모든 모델의 기본 클래스
    """
    __abstract__ = True
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    @declared_attr
    def __tablename__(cls) -> str:
        """
        클래스 이름을 기반으로 테이블 이름 자동 생성
        
        Returns:
            str: 테이블 이름
        """
        return cls.__name__.lower()
    
    def to_dict(self) -> Dict[str, Any]:
        """
        모델 인스턴스를 딕셔너리로 변환
        
        Returns:
            Dict[str, Any]: 모델 속성이 포함된 딕셔너리
        """
        result = {}
        for column in self.__table__.columns:
            result[column.name] = getattr(self, column.name)
        return result
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'BaseModel':
        """
        딕셔너리에서 모델 인스턴스 생성
        
        Args:
            data (Dict[str, Any]): 모델 필드와 값이 포함된 딕셔너리
            
        Returns:
            BaseModel: 생성된 모델 인스턴스
        """
        return cls(**data)

# 여기에 실제 모델 클래스 정의
# 예시: Player 모델 (hermes DB의 players 테이블에 매핑)
class Player(BaseModel, TimestampMixin):
    """
    Players 테이블에 대응하는 모델
    """
    __tablename__ = 'players'
    
    # 테이블 스키마에 맞게 컬럼 정의
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    account = Column(String(100), unique=True, nullable=False)
    status = Column(String(20), nullable=False, default='active')
    
    # 관계 정의
    wallets = relationship("PlayerWallet", back_populates="player")
    comments = relationship("PlayerComment", back_populates="player")
    
    def __repr__(self) -> str:
        return f"<Player(id={self.id}, name='{self.name}', account='{self.account}')>"

class PlayerWallet(BaseModel, TimestampMixin):
    """
    player_wallets 테이블에 대응하는 모델
    """
    __tablename__ = 'player_wallets'
    
    player_id = Column(Integer, ForeignKey('players.id'), nullable=False)
    currency = Column(String(10), nullable=False)
    balance = Column(Float, nullable=False, default=0.0)
    
    # 관계 정의
    player = relationship("Player", back_populates="wallets")
    
    def __repr__(self) -> str:
        return f"<PlayerWallet(id={self.id}, player_id={self.player_id}, currency='{self.currency}', balance={self.balance})>"

class PlayerComment(BaseModel, TimestampMixin):
    """
    player_comments 테이블에 대응하는 모델
    """
    __tablename__ = 'player_comments'
    
    player_id = Column(Integer, ForeignKey('players.id'), nullable=False)
    author = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    
    # 관계 정의
    player = relationship("Player", back_populates="comments")
    
    def __repr__(self) -> str:
        return f"<PlayerComment(id={self.id}, player_id={self.player_id}, author='{self.author}')>"

# 필요에 따라 추가 모델 클래스 정의
