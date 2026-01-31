"""Setup script for Agent Lightning Showcase."""

from setuptools import setup, find_packages

setup(
    name="agent-lightning-showcase",
    version="1.0.0",
    description="Showcase application demonstrating Microsoft's Agent Lightning framework",
    author="Your Name",
    author_email="your.email@example.com",
    packages=find_packages(),
    python_requires=">=3.10",
    install_requires=[
        "agentlightning>=0.1.0",
        "openai>=1.0.0",
        "pydantic>=2.0.0",
        "python-dotenv>=1.0.0",
        "httpx>=0.25.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-asyncio>=0.21.0",
            "black>=23.0.0",
            "mypy>=1.0.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "agl-showcase=agent_lightning_showcase.cli:main",
        ],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
