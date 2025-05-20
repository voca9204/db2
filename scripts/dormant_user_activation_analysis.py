#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
휴면 사용자 재활성화 및 입금 유도 분석 스크립트

이 스크립트는 오랫동안 게임을 하지 않은 사용자(휴면 사용자)가 이벤트를 통해 
게임에 다시 참여하고, 궁극적으로 입금까지 이어지게 하는 전략적 분석을 실행합니다.

실행 방법:
    python dormant_user_activation_analysis.py
"""

import os
import sys
import logging
import pandas as p