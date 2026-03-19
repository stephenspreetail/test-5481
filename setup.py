from setuptools import setup, find_packages

setup(
    name="memex",
    version="0.1.0",
    description="Memex(RL): Indexed Experience Memory for LLM Agents",
    packages=find_packages(exclude=["tests*"]),
    python_requires=">=3.9",
    install_requires=[
        "anthropic>=0.40.0",
        "numpy>=1.24.0",
    ],
    extras_require={
        "dev": [
            "pytest>=8.0.0",
            "pytest-cov>=5.0.0",
            "pytest-mock>=3.12.0",
        ]
    },
)
