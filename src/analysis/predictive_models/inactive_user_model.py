#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Inactive User Re-engagement Prediction Model

This module implements a machine learning model to predict which inactive users
are most likely to respond to specific event types and make deposits after
re-engagement.

The model uses historical user behavior data, previous event responses, and
user segmentation information to make predictions.
"""

import os
import json
import logging
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Union, Optional, Any
from pathlib import Path

# Machine learning libraries
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, GridSearchCV, cross_val_score, StratifiedKFold
from sklearn.preprocessing import StandardScaler, OneHotEncoder, LabelEncoder
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
from sklearn.metrics import precision_recall_curve, roc_curve, auc
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
import joblib

# Project root directory
project_root = Path(__file__).parent.parent.parent.parent
import sys
sys.path.append(str(project_root))

# Import database connection
from src.database.mariadb_connection import MariaDBConnection

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class InactiveUserPredictionModel:
    """
    Model for predicting inactive user re-engagement and conversion probability
    through events.
    """
    
    def __init__(self, config_path: str = None):
        """
        Initialize the prediction model.
        
        Args:
            config_path: Path to the configuration file
        """
        self.db_connection = MariaDBConnection()
        self.models = {}
        self.feature_columns = []
        self.categorical_features = []
        self.numerical_features = []
        self.feature_importances = {}
        self.event_types = {}  # Maps event types to their characteristics
        self.segment_event_mapping = {}  # Maps user segments to optimal event types
        
        # Models directory
        self.models_dir = os.path.join(
            os.path.dirname(__file__), 
            '../../../models/predictive_models'
        )
        self.model_path = os.path.join(self.models_dir, 'inactive_user_model.joblib')
        self.ensemble_model_path = os.path.join(self.models_dir, 'inactive_user_ensemble_model.joblib')
        self.visualizations_dir = os.path.join(self.models_dir, 'visualizations')
        
        self._ensure_model_dirs_exist()
    
    def _ensure_model_dirs_exist(self):
        """Ensure the model and visualization directories exist"""
        for directory in [self.models_dir, self.visualizations_dir]:
            if not os.path.exists(directory):
                os.makedirs(directory)
                logger.info(f"Created directory: {directory}")
    
    def fetch_event_types(self) -> Dict[str, Dict]:
        """
        Fetch available event types and their characteristics from the database.
        
        Returns:
            Dictionary mapping event types to their characteristics
        """
        logger.info("Fetching event types from database")
        
        query = """
        SELECT 
            promotion,
            COUNT(DISTINCT player) AS participant_count,
            AVG(reward) AS avg_reward,
            SUM(CASE WHEN appliedAt IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*) AS fulfillment_rate,
            MIN(createdAt) AS earliest_date,
            MAX(createdAt) AS latest_date
        FROM 
            promotion_players
        GROUP BY 
            promotion
        HAVING 
            COUNT(DISTINCT player) >= 10  -- Only include events with sufficient participants
        """
        
        try:
            with self.db_connection.get_connection() as conn:
                events_df = pd.read_sql(query, conn)
                
                if events_df.empty:
                    logger.warning("No event types found in database")
                    return {}
                
                # Fetch conversion metrics for each event type
                conversion_query = """
                SELECT 
                    pp.promotion,
                    SUM(CASE WHEN (
                        SELECT COUNT(*) FROM money_flows mf 
                        WHERE mf.player = pp.player AND mf.type = 0 AND mf.createdAt > pp.appliedAt
                    ) > 0 THEN 1 ELSE 0 END) AS converted_users,
                    COUNT(DISTINCT pp.player) AS total_users,
                    AVG(CASE WHEN (
                        SELECT SUM(amount) FROM money_flows mf 
                        WHERE mf.player = pp.player AND mf.type = 0 AND mf.createdAt > pp.appliedAt
                    ) > 0 THEN (
                        SELECT SUM(amount) FROM money_flows mf 
                        WHERE mf.player = pp.player AND mf.type = 0 AND mf.createdAt > pp.appliedAt
                    ) ELSE 0 END) AS avg_deposit_amount
                FROM 
                    promotion_players pp
                WHERE 
                    pp.appliedAt IS NOT NULL
                GROUP BY 
                    pp.promotion
                """
                
                conversion_df = pd.read_sql(conversion_query, conn)
                
                # Merge event data with conversion metrics
                if not conversion_df.empty:
                    events_df = pd.merge(
                        events_df, 
                        conversion_df,
                        on='promotion',
                        how='left'
                    )
                    
                    # Calculate conversion rate
                    events_df['conversion_rate'] = events_df.apply(
                        lambda x: x['converted_users'] / x['total_users'] if x['total_users'] > 0 else 0,
                        axis=1
                    )
                    
                    # Calculate ROI (Return on Investment)
                    events_df['roi'] = events_df.apply(
                        lambda x: x['avg_deposit_amount'] / x['avg_reward'] if x['avg_reward'] > 0 else 0,
                        axis=1
                    )
                else:
                    events_df['conversion_rate'] = 0
                    events_df['roi'] = 0
                
                # Convert to dictionary
                event_types = {}
                for _, row in events_df.iterrows():
                    event_type = row['promotion']
                    event_types[event_type] = {
                        'participant_count': int(row['participant_count']),
                        'avg_reward': float(row['avg_reward']),
                        'fulfillment_rate': float(row['fulfillment_rate']),
                        'earliest_date': row['earliest_date'],
                        'latest_date': row['latest_date'],
                        'conversion_rate': float(row.get('conversion_rate', 0)),
                        'avg_deposit_amount': float(row.get('avg_deposit_amount', 0)),
                        'roi': float(row.get('roi', 0))
                    }
                
                self.event_types = event_types
                logger.info(f"Fetched {len(event_types)} event types from database")
                return event_types
                
        except Exception as e:
            logger.error(f"Error fetching event types: {str(e)}")
            return {}
    
    def fetch_training_data(self, lookback_days: int = 365) -> pd.DataFrame:
        """
        Fetch historical data for model training.
        
        Args:
            lookback_days: Number of days to look back for historical data
            
        Returns:
            DataFrame containing the training data
        """
        cutoff_date = datetime.now() - timedelta(days=lookback_days)
        cutoff_date_str = cutoff_date.strftime('%Y-%m-%d')
        
        # Following the variables.md guidelines: avoiding 'id' and 'name' fields
        query = """
        SELECT 
            p.userId,  -- Using userId as the identifier instead of id
            ROUND(IFNULL(
                (SELECT SUM(amount) FROM money_flows 
                 WHERE player = p.id AND type = 0 AND createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY)), 
                0
            )) AS total_deposits_1y,
            ROUND(IFNULL(
                (SELECT SUM(amount) FROM money_flows 
                 WHERE player = p.id AND type = 1 AND createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY)), 
                0
            )) AS total_withdrawals_1y,
            ROUND(IFNULL(
                (SELECT AVG(amount) FROM money_flows 
                 WHERE player = p.id AND type = 0 AND createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY)), 
                0
            )) AS avg_deposit_amount,
            (SELECT COUNT(*) FROM game_scores 
             WHERE userId = p.userId AND gameDate >= DATE_SUB(NOW(), INTERVAL 365 DAY)) AS game_count,
            (SELECT MAX(gameDate) FROM game_scores 
             WHERE userId = p.userId) AS last_played_date,
            (SELECT COUNT(*) FROM promotion_players pp 
             WHERE pp.player = p.id AND pp.appliedAt IS NOT NULL) AS events_received,
            CASE 
                WHEN (SELECT COUNT(*) FROM money_flows 
                      WHERE player = p.id AND type = 0 AND 
                      createdAt > (SELECT MIN(pp2.appliedAt) FROM promotion_players pp2 
                                   WHERE pp2.player = p.id AND pp2.appliedAt IS NOT NULL)) > 0 
                THEN 1 ELSE 0 
            END AS converted_after_event,
            p.status,
            DATEDIFF(NOW(), (SELECT MAX(gameDate) FROM game_scores 
                             WHERE userId = p.userId)) AS days_inactive
        FROM 
            players p
        WHERE 
            p.status = 0  -- Only include active accounts
            AND EXISTS (
                SELECT 1 FROM game_scores gs 
                WHERE gs.userId = p.userId
            )
            AND EXISTS (
                SELECT 1 FROM promotion_players pp 
                WHERE pp.player = p.id
            )
        LIMIT 10000  -- Add limit to prevent overwhelming the database
        """
        
        try:
            with self.db_connection.get_connection() as conn:
                df = pd.read_sql(query, conn)
                logger.info(f"Fetched {len(df)} records for model training")
                return df
        except Exception as e:
            logger.error(f"Error fetching training data: {str(e)}")
            raise
    
    def preprocess_data(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
        """
        Preprocess the data for model training.
        
        Args:
            df: Raw data from the database
            
        Returns:
            Tuple of (features DataFrame, target Series)
        """
        logger.info("Preprocessing data for model training")
        
        # Handle missing values
        df = df.copy()
        df.fillna({
            'total_deposits_1y': 0,
            'total_withdrawals_1y': 0,
            'avg_deposit_amount': 0,
            'game_count': 0,
            'events_received': 0
        }, inplace=True)
        
        # Calculate days since last played
        df['days_since_last_play'] = pd.to_datetime(df['last_played_date']).apply(
            lambda x: (datetime.now() - x).days if pd.notnull(x) else 365
        )
        
        # Define inactive users (90+ days without playing)
        df['is_inactive'] = df['days_since_last_play'] >= 90
        
        # Create features
        df['deposit_withdrawal_ratio'] = df.apply(
            lambda x: x['total_deposits_1y'] / x['total_withdrawals_1y'] 
            if x['total_withdrawals_1y'] > 0 else 
            (1.0 if x['total_deposits_1y'] == 0 else float(x['total_deposits_1y'])), 
            axis=1
        )
        
        # Define the target variable: users who were inactive, received an event, and then made a deposit
        target = df['converted_after_event']
        
        # Define feature columns
        self.numerical_features = [
            'total_deposits_1y', 
            'total_withdrawals_1y',
            'avg_deposit_amount',
            'game_count',
            'days_since_last_play',
            'events_received',
            'deposit_withdrawal_ratio'
        ]
        
        self.categorical_features = [
            'status'
        ]
        
        self.feature_columns = self.numerical_features + self.categorical_features
        features = df[self.feature_columns]
        
        return features, target
    
    def build_preprocessing_pipeline(self) -> ColumnTransformer:
        """
        Build the preprocessing pipeline for feature transformation.
        
        Returns:
            ColumnTransformer for preprocessing features
        """
        # Numerical features pipeline
        numerical_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='median')),
            ('scaler', StandardScaler())
        ])
        
        # Categorical features pipeline
        categorical_transformer = Pipeline(steps=[
            ('imputer', SimpleImputer(strategy='most_frequent')),
            ('onehot', OneHotEncoder(handle_unknown='ignore'))
        ])
        
        # Combine pipelines
        preprocessor = ColumnTransformer(
            transformers=[
                ('num', numerical_transformer, self.numerical_features),
                ('cat', categorical_transformer, self.categorical_features)
            ]
        )
        
        return preprocessor
    
    def _get_models_with_param_grids(self) -> Dict[str, Dict]:
        """
        Get models with hyperparameter grids for optimization.
        
        Returns:
            Dictionary of models with their parameter grids
        """
        models = {
            'logistic_regression': {
                'model': LogisticRegression(max_iter=1000),
                'param_grid': {
                    'C': [0.01, 0.1, 1.0, 10.0],
                    'class_weight': [None, 'balanced'],
                    'solver': ['liblinear', 'saga']
                }
            },
            'random_forest': {
                'model': RandomForestClassifier(random_state=42),
                'param_grid': {
                    'n_estimators': [50, 100, 200],
                    'max_depth': [None, 10, 20, 30],
                    'min_samples_split': [2, 5, 10],
                    'min_samples_leaf': [1, 2, 4],
                    'class_weight': [None, 'balanced']
                }
            },
            'gradient_boosting': {
                'model': GradientBoostingClassifier(random_state=42),
                'param_grid': {
                    'n_estimators': [50, 100, 200],
                    'learning_rate': [0.01, 0.1, 0.2],
                    'max_depth': [3, 5, 7],
                    'min_samples_split': [2, 5, 10],
                    'subsample': [0.8, 1.0]
                }
            }
        }
        
        return models
    
    def _calculate_feature_importance(self, pipeline, X_test, y_test) -> Dict[str, float]:
        """
        Calculate feature importance for the trained model.
        
        Args:
            pipeline: Trained model pipeline
            X_test: Test features
            y_test: Test labels
            
        Returns:
            Dictionary mapping feature names to importance scores
        """
        # Extract the model from the pipeline
        try:
            # Try to get the model from the pipeline
            if hasattr(pipeline, 'named_steps') and 'model' in pipeline.named_steps:
                model = pipeline.named_steps['model']
            else:
                # If it's not in a pipeline format
                model = pipeline
                
            feature_names = []
            
            # Get the preprocessor to map feature names correctly
            if hasattr(pipeline, 'named_steps') and 'preprocessor' in pipeline.named_steps:
                preprocessor = pipeline.named_steps['preprocessor']
                
                # Try to get transformed feature names
                if hasattr(preprocessor, 'get_feature_names_out'):
                    feature_names = preprocessor.get_feature_names_out()
                else:
                    # Fallback to creating generic feature names
                    n_features = X_test.shape[1]
                    feature_names = [f'feature_{i}' for i in range(n_features)]
            else:
                # Fallback to input feature names
                feature_names = X_test.columns.tolist()
            
            # Calculate importance based on model type
            if hasattr(model, 'feature_importances_'):
                # For tree-based models
                importances = model.feature_importances_
                
                # Map importances to feature names
                importance_dict = {}
                for i, feature in enumerate(feature_names):
                    if i < len(importances):
                        importance_dict[feature] = float(importances[i])
                
                return importance_dict
                
            elif hasattr(model, 'coef_'):
                # For linear models
                importances = np.abs(model.coef_[0])
                
                # Map importances to feature names
                importance_dict = {}
                for i, feature in enumerate(feature_names):
                    if i < len(importances):
                        importance_dict[feature] = float(importances[i])
                
                return importance_dict
            
            else:
                # Use permutation importance if built-in methods not available
                perm_importance = permutation_importance(
                    pipeline, X_test, y_test, n_repeats=10, random_state=42
                )
                
                importance_dict = {}
                for i, feature in enumerate(feature_names):
                    if i < len(perm_importance.importances_mean):
                        importance_dict[feature] = float(perm_importance.importances_mean[i])
                
                return importance_dict
                
        except Exception as e:
            logger.error(f"Error calculating feature importance: {str(e)}")
            return {}
    
    def _generate_model_curves(self, model_name: str, y_test: np.ndarray, y_proba: np.ndarray) -> Dict[str, str]:
        """
        Generate and save ROC and precision-recall curves.
        
        Args:
            model_name: Name of the model
            y_test: True labels
            y_proba: Predicted probabilities
            
        Returns:
            Dictionary with paths to the saved curve images
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        curve_paths = {}
        
        try:
            # 1. ROC Curve
            fpr, tpr, _ = roc_curve(y_test, y_proba)
            roc_auc = auc(fpr, tpr)
            
            plt.figure(figsize=(10, 8))
            plt.plot(fpr, tpr, color='darkorange', lw=2, 
                    label=f'ROC curve (area = {roc_auc:.2f})')
            plt.plot([0, 1], [0, 1], color='navy', lw=2, linestyle='--')
            plt.xlim([0.0, 1.0])
            plt.ylim([0.0, 1.05])
            plt.xlabel('False Positive Rate')
            plt.ylabel('True Positive Rate')
            plt.title(f'Receiver Operating Characteristic - {model_name}')
            plt.legend(loc="lower right")
            plt.grid(True, alpha=0.3)
            
            # Save ROC curve
            roc_path = os.path.join(self.visualizations_dir, f"{model_name}_roc_{timestamp}.png")
            plt.savefig(roc_path)
            plt.close()
            curve_paths['roc'] = roc_path
            
            # 2. Precision-Recall Curve
            precision, recall, _ = precision_recall_curve(y_test, y_proba)
            pr_auc = auc(recall, precision)
            
            plt.figure(figsize=(10, 8))
            plt.plot(recall, precision, color='blue', lw=2,
                    label=f'Precision-Recall curve (area = {pr_auc:.2f})')
            plt.axhline(y=sum(y_test)/len(y_test), color='navy', linestyle='--', 
                    label=f'No Skill (baseline = {sum(y_test)/len(y_test):.2f})')
            plt.xlim([0.0, 1.0])
            plt.ylim([0.0, 1.05])
            plt.xlabel('Recall')
            plt.ylabel('Precision')
            plt.title(f'Precision-Recall Curve - {model_name}')
            plt.legend(loc="best")
            plt.grid(True, alpha=0.3)
            
            # Save Precision-Recall curve
            pr_path = os.path.join(self.visualizations_dir, f"{model_name}_precision_recall_{timestamp}.png")
            plt.savefig(pr_path)
            plt.close()
            curve_paths['precision_recall'] = pr_path
            
            return curve_paths
            
        except Exception as e:
            logger.error(f"Error generating model curves: {str(e)}")
            return {}
    
    def _create_ensemble_model(self, results: Dict[str, Dict], 
                             X_train: pd.DataFrame, y_train: pd.Series,
                             X_test: pd.DataFrame, y_test: pd.Series) -> Dict[str, Any]:
        """
        Create an ensemble model from the trained models.
        
        Args:
            results: Dictionary of trained models and their results
            X_train: Training features
            y_train: Training labels
            X_test: Test features
            y_test: Test labels
            
        Returns:
            Dictionary with ensemble model results
        """
        logger.info("Creating ensemble model")
        
        try:
            # Create list of (name, model) tuples for VotingClassifier
            estimators = []
            
            for name, result in results.items():
                if 'pipeline' in result:
                    # Extract the model from the pipeline
                    pipeline = result['pipeline']
                    
                    if hasattr(pipeline, 'named_steps') and 'model' in pipeline.named_steps:
                        model = pipeline.named_steps['model']
                        estimators.append((name, model))
            
            if len(estimators) < 2:
                logger.warning("Not enough models for ensemble")
                return {}
            
            # Create voting classifier (soft voting uses predicted probabilities)
            voting_clf = VotingClassifier(
                estimators=estimators,
                voting='soft'
            )
            
            # Build ensemble pipeline with preprocessing
            preprocessor = self.build_preprocessing_pipeline()
            ensemble_pipeline = Pipeline(steps=[
                ('preprocessor', preprocessor),
                ('model', voting_clf)
            ])
            
            # Train ensemble
            ensemble_pipeline.fit(X_train, y_train)
            
            # Evaluate on test set
            y_pred = ensemble_pipeline.predict(X_test)
            y_proba = ensemble_pipeline.predict_proba(X_test)[:, 1]
            
            # Calculate metrics
            precision = precision_score(y_test, y_pred)
            recall = recall_score(y_test, y_pred)
            f1 = f1_score(y_test, y_pred)
            auc_score = roc_auc_score(y_test, y_proba)
            
            # Calculate confusion matrix
            cm = confusion_matrix(y_test, y_pred)
            
            # Generate ROC and precision-recall curves
            curve_paths = self._generate_model_curves('ensemble', y_test, y_proba)
            
            # Create result dictionary
            ensemble_result = {
                'pipeline': ensemble_pipeline,
                'precision': precision,
                'recall': recall,
                'f1': f1,
                'auc': auc_score,
                'confusion_matrix': cm,
                'curve_paths': curve_paths
            }
            
            logger.info(f"Ensemble model - Precision: {precision:.4f}, Recall: {recall:.4f}, "
                      f"F1: {f1:.4f}, AUC: {auc_score:.4f}")
            
            return ensemble_result
            
        except Exception as e:
            logger.error(f"Error creating ensemble model: {str(e)}")
            return {}
    
    def train_model(self, features: pd.DataFrame, target: pd.Series, optimize_hyperparams: bool = True) -> Dict:
        """
        Train multiple models and select the best one.
        
        Args:
            features: Feature DataFrame
            target: Target Series
            optimize_hyperparams: Whether to perform hyperparameter optimization
            
        Returns:
            Dictionary of trained models with their scores
        """
        logger.info("Starting model training")
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            features, target, test_size=0.2, random_state=42, stratify=target
        )
        
        # Build preprocessing pipeline
        preprocessor = self.build_preprocessing_pipeline()
        
        # Define models to try
        if optimize_hyperparams:
            # Define models with hyperparameter grids
            models_to_try = self._get_models_with_param_grids()
            logger.info("Using hyperparameter optimization")
        else:
            # Define models with default parameters
            models_to_try = {
                'logistic_regression': {
                    'model': LogisticRegression(class_weight='balanced', max_iter=1000),
                    'param_grid': None
                },
                'random_forest': {
                    'model': RandomForestClassifier(
                        n_estimators=100, 
                        class_weight='balanced', 
                        random_state=42
                    ),
                    'param_grid': None
                },
                'gradient_boosting': {
                    'model': GradientBoostingClassifier(
                        n_estimators=100, 
                        random_state=42
                    ),
                    'param_grid': None
                }
            }
        
        # Train each model
        results = {}
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
        
        for name, model_info in models_to_try.items():
            logger.info(f"Training {name} model")
            
            # Create pipeline with preprocessing
            pipeline = Pipeline(steps=[
                ('preprocessor', preprocessor),
                ('model', model_info['model'])
            ])
            
            # If hyperparameter optimization is enabled
            if optimize_hyperparams and model_info['param_grid']:
                param_grid = {f'model__{param}': values for param, values in model_info['param_grid'].items()}
                
                # Create grid search with cross-validation
                grid_search = GridSearchCV(
                    pipeline,
                    param_grid,
                    cv=cv,
                    scoring='precision',
                    n_jobs=-1
                )
                
                # Train with grid search
                grid_search.fit(X_train, y_train)
                
                # Get best model
                best_model = grid_search.best_estimator_
                best_params = grid_search.best_params_
                logger.info(f"Best params for {name}: {best_params}")
                
                # Get cross-validation results
                cv_results = grid_search.cv_results_
                cv_precision = cv_results['mean_test_score'][grid_search.best_index_]
                logger.info(f"Cross-validation precision for {name}: {cv_precision:.4f}")
                
                pipeline = best_model
            else:
                # Train without hyperparameter optimization
                pipeline.fit(X_train, y_train)
                
                # Get cross-validation scores
                cv_precision = np.mean(cross_val_score(pipeline, X_train, y_train, cv=cv, scoring='precision'))
                logger.info(f"Cross-validation precision for {name}: {cv_precision:.4f}")
            
            # Evaluate on test set
            y_pred = pipeline.predict(X_test)
            
            # Calculate metrics
            precision = precision_score(y_test, y_pred)
            recall = recall_score(y_test, y_pred)
            f1 = f1_score(y_test, y_pred)
            
            # For probability-based metrics
            y_proba = pipeline.predict_proba(X_test)[:, 1]
            auc_score = roc_auc_score(y_test, y_proba)
            
            # Calculate confusion matrix
            cm = confusion_matrix(y_test, y_pred)
            
            # Generate feature importance if applicable
            feature_importance = self._calculate_feature_importance(pipeline, X_test, y_test)
            
            results[name] = {
                'pipeline': pipeline,
                'precision': precision,
                'recall': recall,
                'f1': f1,
                'auc': auc_score,
                'cv_precision': cv_precision,
                'confusion_matrix': cm,
                'feature_importance': feature_importance
            }
            
            logger.info(f"{name} results - Precision: {precision:.4f}, Recall: {recall:.4f}, "
                      f"F1: {f1:.4f}, AUC: {auc_score:.4f}")
            
            # Generate and save ROC and precision-recall curves
            curve_paths = self._generate_model_curves(name, y_test, y_proba)
            results[name]['curve_paths'] = curve_paths
        
        # Create ensemble model if multiple models are available
        if len(results) > 1:
            ensemble_model = self._create_ensemble_model(results, X_train, y_train, X_test, y_test)
            results['ensemble'] = ensemble_model
        
        # Select best model based on precision (most important for high-value targeting)
        best_model_name = max(results.items(), key=lambda x: x[1]['precision'])[0]
        logger.info(f"Best model: {best_model_name} with precision: {results[best_model_name]['precision']:.4f}")
        
        self.models = results
        return results
    
    def save_model(self, model_name: str = None) -> str:
        """
        Save the trained model to disk.
        
        Args:
            model_name: Name of the model to save. If None, save the best model.
            
        Returns:
            Path to the saved model
        """
        if not self.models:
            raise ValueError("No models have been trained yet")
        
        if model_name is None:
            # Select best model based on precision
            model_name = max(self.models.items(), key=lambda x: x[1]['precision'])[0]
        
        if model_name not in self.models:
            raise ValueError(f"Model {model_name} not found")
        
        # Save the model
        pipeline = self.models[model_name]['pipeline']
        joblib.dump(pipeline, self.model_path)
        
        # Save feature importances if available
        if 'feature_importance' in self.models[model_name]:
            feature_importance = self.models[model_name]['feature_importance']
            feature_importance_path = os.path.join(
                self.models_dir, 
                f"{model_name}_feature_importance.json"
            )
            
            # Convert to serializable format
            serializable_importance = {k: float(v) for k, v in feature_importance.items()}
            
            with open(feature_importance_path, 'w') as f:
                json.dump(serializable_importance, f, indent=2)
        
        # Save ensemble model separately if it exists
        if model_name == 'ensemble':
            joblib.dump(pipeline, self.ensemble_model_path)
        
        logger.info(f"Model {model_name} saved to {self.model_path}")
        return self.model_path
    
    def load_model(self, model_path: str = None) -> Pipeline:
        """
        Load a trained model from disk.
        
        Args:
            model_path: Path to the model file. If None, use default path.
            
        Returns:
            Loaded model pipeline
        """
        if model_path is None:
            model_path = self.model_path
        
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")
        
        pipeline = joblib.load(model_path)
        logger.info(f"Model loaded from {model_path}")
        
        return pipeline
    
    def predict_reengagement(self, user_data: pd.DataFrame) -> pd.DataFrame:
        """
        Predict re-engagement probability for inactive users.
        
        Args:
            user_data: DataFrame with user features
            
        Returns:
            DataFrame with original data plus prediction probabilities
        """
        if not os.path.exists(self.model_path):
            logger.warning(f"Model file not found: {self.model_path}")
            logger.info("Training a new model...")
            
            # Train a new model if one doesn't exist
            try:
                training_data = self.fetch_training_data()
                features, target = self.preprocess_data(training_data)
                results = self.train_model(features, target, optimize_hyperparams=False)
                self.save_model()
            except Exception as e:
                logger.error(f"Error training new model: {str(e)}")
                # If we can't train a new model, return basic probabilities
                result = user_data.copy()
                result['reengagement_probability'] = 0.5  # Default value
                result['recommended_for_event'] = True  # Default to recommending for event
                return result
        
        pipeline = self.load_model()
        
        # Process input data to match feature requirements
        processed_data = user_data.copy()
        
        # Calculate days since last played if not present
        if 'days_since_last_play' not in processed_data.columns and 'last_played_date' in processed_data.columns:
            processed_data['days_since_last_play'] = pd.to_datetime(processed_data['last_played_date']).apply(
                lambda x: (datetime.now() - x).days if pd.notnull(x) else 365
            )
        
        # Calculate deposit_withdrawal_ratio if not present
        if 'deposit_withdrawal_ratio' not in processed_data.columns:
            processed_data['deposit_withdrawal_ratio'] = processed_data.apply(
                lambda x: x['total_deposits_1y'] / x['total_withdrawals_1y'] 
                if 'total_withdrawals_1y' in processed_data.columns and x['total_withdrawals_1y'] > 0 else 
                (1.0 if 'total_deposits_1y' in processed_data.columns and x['total_deposits_1y'] == 0 else 10.0), 
                axis=1
            )
        
        # Ensure all required feature columns are present
        for feature in self.feature_columns:
            if feature not in processed_data.columns:
                logger.warning(f"Feature '{feature}' not in input data, adding with default values")
                if feature in self.numerical_features:
                    processed_data[feature] = 0.0
                else:
                    processed_data[feature] = 'unknown'
        
        # Make predictions
        features = processed_data[self.feature_columns]
        try:
            proba = pipeline.predict_proba(features)[:, 1]
            
            # Add predictions to the original data
            result = user_data.copy()
            result['reengagement_probability'] = proba
            result['recommended_for_event'] = proba >= 0.6  # Threshold can be adjusted
            
            # Add event recommendations if event types are available
            if self.event_types:
                # Match users to optimal events based on their characteristics
                result = self._match_users_to_optimal_events(result)
            
            return result
            
        except Exception as e:
            logger.error(f"Error predicting reengagement: {str(e)}")
            # Return a default prediction
            result = user_data.copy()
            result['reengagement_probability'] = 0.5  # Default value
            result['recommended_for_event'] = True  # Default to recommending for event
            return result
        
    def _match_users_to_optimal_events(self, users: pd.DataFrame) -> pd.DataFrame:
        """
        Match users to optimal event types based on their characteristics.
        
        Args:
            users: DataFrame with user data and prediction probabilities
            
        Returns:
            DataFrame with added optimal event recommendations
        """
        # Ensure we have event types
        if not self.event_types:
            # Fetch event types if not already loaded
            self.fetch_event_types()
            
            if not self.event_types:
                logger.warning("No event types available for matching")
                return users
        
        result = users.copy()
        
        # Add columns for event recommendations
        result['optimal_event_type'] = None
        result['recommended_reward'] = 0.0
        result['expected_roi'] = 0.0
        
        # Define user segments based on prediction probability
        result['targeting_tier'] = pd.cut(
            result['reengagement_probability'],
            bins=[0, 0.3, 0.6, 0.8, 1.0],
            labels=['Low', 'Medium', 'High', 'Very High']
        )
        
        # Create event recommendation logic
        for tier in ['Very High', 'High', 'Medium', 'Low']:
            tier_users = result[result['targeting_tier'] == tier]
            
            if tier_users.empty:
                continue
            
            # Select optimal event type based on tier
            if tier == 'Very High':
                # For highest probability users, use events with highest ROI
                optimal_events = sorted(
                    self.event_types.items(),
                    key=lambda x: x[1].get('roi', 0),
                    reverse=True
                )
            elif tier == 'High':
                # For high probability users, use events with high conversion rate
                optimal_events = sorted(
                    self.event_types.items(),
                    key=lambda x: x[1].get('conversion_rate', 0),
                    reverse=True
                )
            elif tier == 'Medium':
                # For medium probability users, balance conversion and cost
                optimal_events = sorted(
                    self.event_types.items(),
                    key=lambda x: (x[1].get('conversion_rate', 0) * 0.7 + 
                                  (1 / max(x[1].get('avg_reward', 1), 1)) * 0.3),
                    reverse=True
                )
            else:  # Low
                # For low probability users, use low-cost events
                optimal_events = sorted(
                    self.event_types.items(),
                    key=lambda x: x[1].get('avg_reward', float('inf'))
                )
            
            if not optimal_events:
                continue
                
            # Use the top event for this tier
            top_event = optimal_events[0]
            event_id = top_event[0]
            event_info = top_event[1]
            
            # Update recommendations for users in this tier
            result.loc[result['targeting_tier'] == tier, 'optimal_event_type'] = event_id
            result.loc[result['targeting_tier'] == tier, 'recommended_reward'] = event_info.get('avg_reward', 0)
            result.loc[result['targeting_tier'] == tier, 'expected_roi'] = event_info.get('roi', 0)
        
        return result
    
    def get_high_potential_users(self, top_n: int = 100) -> pd.DataFrame:
        """
        Get inactive users with high potential for re-engagement.
        
        Args:
            top_n: Number of top users to return
            
        Returns:
            DataFrame with high-potential inactive users
        """
        logger.info(f"Fetching top {top_n} high-potential inactive users")
        
        # Query to get inactive users (no activity in the last 90 days)
        inactive_users_query = """
        SELECT 
            p.userId,  -- Using userId as the identifier instead of id or name
            ROUND(IFNULL(
                (SELECT SUM(amount) FROM money_flows 
                 WHERE player = p.id AND type = 0 AND createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY)), 
                0
            )) AS total_deposits_1y,
            ROUND(IFNULL(
                (SELECT SUM(amount) FROM money_flows 
                 WHERE player = p.id AND type = 1 AND createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY)), 
                0
            )) AS total_withdrawals_1y,
            ROUND(IFNULL(
                (SELECT AVG(amount) FROM money_flows 
                 WHERE player = p.id AND type = 0 AND createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY)), 
                0
            )) AS avg_deposit_amount,
            (SELECT COUNT(*) FROM game_scores 
             WHERE userId = p.userId AND gameDate >= DATE_SUB(NOW(), INTERVAL 365 DAY)) AS game_count,
            (SELECT MAX(gameDate) FROM game_scores 
             WHERE userId = p.userId) AS last_played_date,
            (SELECT COUNT(*) FROM promotion_players pp 
             WHERE pp.player = p.id AND pp.appliedAt IS NOT NULL) AS events_received,
            p.status,
            DATEDIFF(NOW(), (SELECT MAX(gameDate) FROM game_scores 
                             WHERE userId = p.userId)) AS days_inactive
        FROM 
            players p
        WHERE 
            p.status = 0  -- Only active accounts
            AND (
                -- No activity in the last 90 days, but has played before
                SELECT MAX(gameDate) FROM game_scores WHERE userId = p.userId
            ) < DATE_SUB(NOW(), INTERVAL 90 DAY)
            AND (
                -- Has played at least once
                SELECT COUNT(*) FROM game_scores WHERE userId = p.userId
            ) > 0
        LIMIT 1000  -- Limit to prevent overwhelming the database
        """
        
        try:
            with self.db_connection.get_connection() as conn:
                inactive_df = pd.read_sql(inactive_users_query, conn)
                
                if inactive_df.empty:
                    logger.warning("No inactive users found")
                    return pd.DataFrame()
                
                # Process data for prediction
                inactive_df['days_since_last_play'] = pd.to_datetime(inactive_df['last_played_date']).apply(
                    lambda x: (datetime.now() - x).days if pd.notnull(x) else 365
                )
                
                inactive_df['deposit_withdrawal_ratio'] = inactive_df.apply(
                    lambda x: x['total_deposits_1y'] / x['total_withdrawals_1y'] 
                    if x['total_withdrawals_1y'] > 0 else 
                    (1.0 if x['total_deposits_1y'] == 0 else float(x['total_deposits_1y'])), 
                    axis=1
                )
                
                # Make predictions
                predictions = self.predict_reengagement(inactive_df)
                
                # Sort by re-engagement probability (descending)
                sorted_predictions = predictions.sort_values('reengagement_probability', ascending=False)
                
                # Return top N users
                top_users = sorted_predictions.head(top_n)
                logger.info(f"Found {len(top_users)} high-potential inactive users")
                
                return top_users
                
        except Exception as e:
            logger.error(f"Error fetching high-potential users: {str(e)}")
            raise
    
    def analyze_feature_importance(self) -> Dict[str, Any]:
        """
        Analyze and visualize feature importance.
        
        Returns:
            Dictionary with feature importance analysis results
        """
        if not self.models:
            logger.warning("No models available for feature importance analysis")
            return {}
        
        analysis_results = {}
        
        for model_name, model_info in self.models.items():
            if 'feature_importance' not in model_info:
                continue
            
            feature_importance = model_info['feature_importance']
            
            if not feature_importance:
                continue
            
            # Sort features by importance
            sorted_importance = dict(sorted(
                feature_importance.items(), 
                key=lambda x: x[1], 
                reverse=True
            ))
            
            # Visualize feature importance
            try:
                plt.figure(figsize=(12, 8))
                
                features = list(sorted_importance.keys())[:10]  # Top 10 features
                importances = [sorted_importance[f] for f in features]
                
                # Create horizontal bar chart
                plt.barh(range(len(features)), importances, align='center')
                plt.yticks(range(len(features)), features)
                plt.xlabel('Importance')
                plt.title(f'Feature Importance - {model_name}')
                
                # Save visualization
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                viz_path = os.path.join(
                    self.visualizations_dir, 
                    f"{model_name}_feature_importance_{timestamp}.png"
                )
                plt.savefig(viz_path)
                plt.close()
                
                analysis_results[model_name] = {
                    'importance': sorted_importance,
                    'visualization_path': viz_path
                }
                
            except Exception as e:
                logger.error(f"Error visualizing feature importance for {model_name}: {str(e)}")
        
        self.feature_importances = {k: v['importance'] for k, v in analysis_results.items()}
        return analysis_results


def train_and_save_model():
    """
    Utility function to train and save the model.
    """
    model = InactiveUserPredictionModel()
    df = model.fetch_training_data()
    features, target = model.preprocess_data(df)
    results = model.train_model(features, target, optimize_hyperparams=True)
    model_path = model.save_model()
    
    logger.info(f"Model training complete. Model saved to {model_path}")
    
    # Print model performance metrics
    for name, result in results.items():
        logger.info(f"{name} - Precision: {result['precision']:.4f}, Recall: {result['recall']:.4f}, AUC: {result['auc']:.4f}")
    
    # Analyze feature importance
    importance_analysis = model.analyze_feature_importance()
    logger.info(f"Feature importance analysis complete. Visualization saved.")
    
    # Fetch event types
    event_types = model.fetch_event_types()
    if event_types:
        logger.info(f"Fetched {len(event_types)} event types for targeting.")
    else:
        logger.warning("No event types available for targeting.")


if __name__ == "__main__":
    train_and_save_model()
