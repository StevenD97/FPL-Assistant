"""
The startup warm exists so the first visitor doesn't pay to build the
prediction cache. These check it can be turned off, that it actually fills the
cache, and - the important one - that a failure inside it never stops the app
starting.
"""
import os
from unittest.mock import patch

from fpl.api import warmup
from fpl.model import predict as predict_module


def test_skipped_when_opted_out():
    with patch.dict(os.environ, {"FPL_SKIP_WARMUP": "1"}):
        assert warmup.start_warmup() is None


def test_a_failing_warm_does_not_raise():
    """Warming is an optimisation; the app must start regardless."""
    with patch.dict(os.environ, {"FPL_SKIP_WARMUP": ""}), \
         patch.object(warmup, "_warm", side_effect=RuntimeError("boom")):
        thread = warmup.start_warmup()
    assert thread is not None
    assert not thread.is_alive(), "the thread should have finished, not hung"


def test_warm_populates_the_prediction_cache():
    predict_module._predict_multi_gw_breakdown_cached.cache_clear()
    before = predict_module._predict_multi_gw_breakdown_cached.cache_info().currsize
    with patch.dict(os.environ, {"FPL_SKIP_WARMUP": ""}):
        warmup.start_warmup()
    after = predict_module._predict_multi_gw_breakdown_cached.cache_info().currsize
    assert after > before, "warmup should leave a prediction context cached"
